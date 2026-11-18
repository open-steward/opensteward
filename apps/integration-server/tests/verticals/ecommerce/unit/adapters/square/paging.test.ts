/**
 * Square paging contract.
 *
 * Every Square list endpoint the adapter reads pages by an opaque `cursor`:
 * "A pagination cursor returned by a previous call to this endpoint. Provide
 * this cursor to retrieve the next set of results for your original query."
 * The response `cursor` is absent (or empty) on the last page.
 *
 * Page sizes differ per endpoint, and two of them are only advisory:
 *   - SearchCatalogObjects (products, variants, collections, discounts):
 *     "The limit is advisory - the implementation may return more or fewer
 *     results. If the supplied limit is negative, zero, or is higher than the
 *     maximum limit of 1,000, it will be ignored."
 *   - ListCustomers: "This limit is advisory. The response might contain more
 *     or fewer results. If the specified limit is less than 1 or greater than
 *     100, Square returns a 400 VALUE_TOO_LOW or 400 VALUE_TOO_HIGH error."
 *   - ListPaymentRefunds: "If the supplied value is greater than 100, no more
 *     than 100 results are returned."
 *   - ListPayments: "If the provided value is greater than 100, it is ignored
 *     and the default value is used instead." (default 100)
 *   - SearchOrders: Default 500, Max 1000; the cursor needs "the original query".
 *   - BatchRetrieveInventoryCounts: Min 1, Max 1000.
 *   - ListLocations: no paging parameters at all.
 *
 * The fake upstream below honours only those parameters, enforces those
 * ceilings the way the docs say, and binds each cursor to the query that
 * minted it, so a cursor replayed under another query is a 400.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { SquareAdapter } from '../../../../../../src/verticals/ecommerce/adapters/square/index'

type Row = Record<string, unknown>

const CREDS = { accessToken: 'sq-token', extra: { locationId: 'L1' } }

interface Call {
  method: 'GET' | 'POST'
  path: string
  args: Record<string, unknown>
}

function bad(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

type Endpoint =
  | 'catalog/search'
  | 'customers'
  | 'refunds'
  | 'payments'
  | 'orders/search'
  | 'inventory/counts/batch-retrieve'

/** How each endpoint reads `limit`, per its reference page. Throws a 400 where the docs say so. */
const LIMIT: Record<Endpoint, (raw: unknown) => number> = {
  'catalog/search': (raw) => {
    const n = raw === undefined ? NaN : Number(raw)
    return Number.isFinite(n) && n > 0 && n <= 1000 ? n : 100
  },
  customers: (raw) => {
    if (raw === undefined) return 100
    const n = Number(raw)
    if (n < 1) throw bad('VALUE_TOO_LOW')
    if (n > 100) throw bad('VALUE_TOO_HIGH')
    return n
  },
  refunds: (raw) => (raw === undefined ? 100 : Math.min(Number(raw), 100)),
  payments: (raw) => {
    if (raw === undefined) return 100
    const n = Number(raw)
    return n > 100 ? 100 : n
  },
  'orders/search': (raw) => {
    if (raw === undefined) return 500
    const n = Number(raw)
    if (n < 1 || n > 1000) throw bad('limit out of range')
    return n
  },
  'inventory/counts/batch-retrieve': (raw) => {
    if (raw === undefined) return 1000
    const n = Number(raw)
    if (n < 1 || n > 1000) throw bad('limit out of range')
    return n
  },
}

const ENVELOPE: Record<Endpoint, string> = {
  'catalog/search': 'objects',
  customers: 'customers',
  refunds: 'refunds',
  payments: 'payments',
  'orders/search': 'orders',
  'inventory/counts/batch-retrieve': 'counts',
}

interface Data {
  catalog: Row[]
  customers: Row[]
  refunds: Row[]
  payments: Row[]
  orders: Row[]
  counts: Row[]
  locations: Row[]
}

interface ServerOpts {
  /** Extra rows an advisory endpoint returns beyond the limit it was sent. */
  advisoryExtra?: number
}

function emptyData(): Data {
  return {
    catalog: [],
    customers: [],
    refunds: [],
    payments: [],
    orders: [],
    counts: [],
    locations: [],
  }
}

function makeServer(data: Data, opts: ServerOpts = {}) {
  const calls: Call[] = []
  const cursorFor = (path: string, offset: number, query: Row): string =>
    Buffer.from(JSON.stringify({ path, offset, query })).toString('base64')

  function page(path: Endpoint, args: Row, all: Row[]): Row {
    const { cursor, ...query } = args
    let start = 0
    if (cursor !== undefined && cursor !== null) {
      let decoded: { path: string; offset: number; query: Row }
      try {
        decoded = JSON.parse(Buffer.from(String(cursor), 'base64').toString()) as typeof decoded
      } catch {
        throw bad('invalid cursor')
      }
      if (decoded.path !== path) throw bad('cursor from another endpoint')
      if (JSON.stringify(decoded.query) !== JSON.stringify(query))
        throw bad('cursor used with a query other than the original')
      start = decoded.offset
    }
    let size = LIMIT[path](query['limit'])
    if (
      opts.advisoryExtra &&
      (path === 'catalog/search' || path === 'customers') &&
      query['limit'] !== undefined
    )
      size += opts.advisoryExtra
    const slice = all.slice(start, start + size)
    const next = start + size < all.length ? cursorFor(path, start + size, query) : undefined
    // ListPayments and ListPaymentRefunds say "If empty, this is the final
    // response": send '' there, and leave it unset elsewhere.
    const out: Row = { [ENVELOPE[path]]: slice }
    if (next !== undefined) out['cursor'] = next
    else if (path === 'payments' || path === 'refunds') out['cursor'] = ''
    return out
  }

  const get = vi.fn(async (path: string, config?: { params?: Row }) => {
    const params = { ...(config?.params ?? {}) }
    for (const k of Object.keys(params)) if (params[k] === undefined) delete params[k]
    calls.push({ method: 'GET', path, args: params })
    if (path === 'locations') return { data: { locations: data.locations } }
    if (path === 'customers' || path === 'refunds' || path === 'payments') {
      const documented: Row = {}
      if (params['cursor'] !== undefined) documented['cursor'] = params['cursor']
      if (params['limit'] !== undefined) documented['limit'] = params['limit']
      const source =
        path === 'customers' ? data.customers : path === 'refunds' ? data.refunds : data.payments
      return { data: page(path, documented, source) }
    }
    const obj = /^catalog\/object\/(.+)$/.exec(path)
    if (obj) {
      const hit = data.catalog.find((r) => r['id'] === obj[1])
      if (!hit) throw Object.assign(new Error('404'), { response: { status: 404 } })
      return { data: { object: hit } }
    }
    const ord = /^orders\/(.+)$/.exec(path)
    if (ord) {
      const hit = data.orders.find((r) => r['id'] === ord[1])
      if (!hit) throw Object.assign(new Error('404'), { response: { status: 404 } })
      return { data: { order: hit } }
    }
    throw new Error(`unexpected GET in test: ${path}`)
  })

  const post = vi.fn(async (path: string, body?: Row) => {
    const b = JSON.parse(JSON.stringify(body ?? {})) as Row
    calls.push({ method: 'POST', path, args: b })
    if (path === 'catalog/search') {
      const types = (b['object_types'] as string[] | undefined) ?? []
      const rows = data.catalog.filter((r) => types.includes(String(r['type'])))
      const documented: Row = { object_types: types }
      if (b['cursor'] !== undefined) documented['cursor'] = b['cursor']
      if (b['limit'] !== undefined) documented['limit'] = b['limit']
      return { data: page(path, documented, rows) }
    }
    if (path === 'orders/search') {
      const locs = b['location_ids'] as string[] | undefined
      if (!locs || locs.length === 0) throw bad('location_ids required')
      const rows = data.orders.filter((r) => locs.includes(String(r['location_id'])))
      const documented: Row = { location_ids: locs }
      if (b['cursor'] !== undefined) documented['cursor'] = b['cursor']
      if (b['limit'] !== undefined) documented['limit'] = b['limit']
      return { data: page(path, documented, rows) }
    }
    if (path === 'inventory/counts/batch-retrieve') {
      const locs = b['location_ids'] as string[] | undefined
      const objs = b['catalog_object_ids'] as string[] | undefined
      const rows = data.counts.filter(
        (r) =>
          (!locs || locs.includes(String(r['location_id']))) &&
          (!objs || objs.includes(String(r['catalog_object_id']))),
      )
      const documented: Row = {}
      if (locs) documented['location_ids'] = locs
      if (objs) documented['catalog_object_ids'] = objs
      if (b['cursor'] !== undefined) documented['cursor'] = b['cursor']
      if (b['limit'] !== undefined) documented['limit'] = b['limit']
      return { data: page(path, documented, rows) }
    }
    throw new Error(`unexpected POST in test: ${path}`)
  })

  vi.spyOn(axios, 'create').mockReturnValue({ get, post, defaults: {} } as never)
  return { calls, cursorFor }
}

const pad = (i: number): string => String(i + 1).padStart(4, '0')

function items(n: number, variationsPer: (i: number) => number = () => 1): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const id = `ITEM-${pad(i)}`
    return {
      id,
      type: 'ITEM',
      item_data: {
        name: id,
        variations: Array.from({ length: variationsPer(i) }, (_, k) => ({
          id: `${id}-v${k}`,
          type: 'ITEM_VARIATION',
          item_variation_data: { item_id: id, name: `v${k}` },
        })),
      },
    }
  })
}

interface Case {
  method:
    | 'listProducts'
    | 'listCollections'
    | 'listDiscounts'
    | 'listCustomers'
    | 'listRefunds'
    | 'listTransactions'
    | 'listOrders'
    | 'listInventoryLevels'
  endpoint: Endpoint
  /** The collection with n rows; returns the ids in upstream order. */
  seed: (n: number) => { data: Data; ids: string[] }
  idOf: (row: Row) => string
  /** The request args besides cursor/limit that every page must repeat. */
  query: Row
  /** Largest page the endpoint serves. */
  max: number
}

const byId = (r: Row) => String(r['id'])

function seedWith(key: keyof Data, make: (i: number) => Row) {
  return (n: number) => {
    const data = emptyData()
    data[key] = Array.from({ length: n }, (_, i) => make(i))
    return { data, ids: data[key].map((r) => String(r['id'] ?? r['__id'])) }
  }
}

const CASES: Case[] = [
  {
    method: 'listProducts',
    endpoint: 'catalog/search',
    seed: (n) => {
      const data = emptyData()
      data.catalog = [...items(n), { id: 'CAT-x', type: 'CATEGORY', category_data: { name: 'x' } }]
      return { data, ids: data.catalog.filter((r) => r['type'] === 'ITEM').map(byId) }
    },
    idOf: byId,
    query: { object_types: ['ITEM'] },
    max: 1000,
  },
  {
    method: 'listCollections',
    endpoint: 'catalog/search',
    seed: seedWith('catalog', (i) => ({
      id: `CAT-${pad(i)}`,
      type: 'CATEGORY',
      category_data: { name: `c${i}` },
    })),
    idOf: byId,
    query: { object_types: ['CATEGORY'] },
    max: 1000,
  },
  {
    method: 'listDiscounts',
    endpoint: 'catalog/search',
    seed: seedWith('catalog', (i) => ({
      id: `DISC-${pad(i)}`,
      type: 'DISCOUNT',
      discount_data: { name: `d${i}`, discount_type: 'FIXED_PERCENTAGE', percentage: '10' },
    })),
    idOf: byId,
    query: { object_types: ['DISCOUNT'] },
    max: 1000,
  },
  {
    method: 'listCustomers',
    endpoint: 'customers',
    seed: seedWith('customers', (i) => ({ id: `CUST-${pad(i)}` })),
    idOf: byId,
    query: {},
    max: 100,
  },
  {
    method: 'listRefunds',
    endpoint: 'refunds',
    seed: seedWith('refunds', (i) => ({
      id: `REF-${pad(i)}`,
      payment_id: `PAY-${pad(i)}`,
      status: 'COMPLETED',
      amount_money: { amount: 100, currency: 'USD' },
    })),
    idOf: byId,
    query: {},
    max: 100,
  },
  {
    method: 'listTransactions',
    endpoint: 'payments',
    seed: seedWith('payments', (i) => ({
      id: `PAY-${pad(i)}`,
      status: 'COMPLETED',
      amount_money: { amount: 100, currency: 'USD' },
    })),
    idOf: byId,
    query: {},
    max: 100,
  },
  {
    method: 'listOrders',
    endpoint: 'orders/search',
    seed: seedWith('orders', (i) => ({ id: `ORD-${pad(i)}`, location_id: 'L1', state: 'OPEN' })),
    idOf: byId,
    query: { location_ids: ['L1'] },
    max: 1000,
  },
  {
    method: 'listInventoryLevels',
    endpoint: 'inventory/counts/batch-retrieve',
    seed: (n) => {
      const data = emptyData()
      data.counts = Array.from({ length: n }, (_, i) => ({
        catalog_object_id: `VAR-${pad(i)}`,
        location_id: 'L1',
        quantity: '1',
        state: 'IN_STOCK',
      }))
      return { data, ids: data.counts.map((r) => `${String(r['catalog_object_id'])}:L1`) }
    },
    idOf: byId,
    query: { location_ids: ['L1'] },
    max: 1000,
  },
]

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

async function rowsOf(adapter: SquareAdapter, c: Case, params: QueryParams): Promise<Row[]> {
  return (await adapter[c.method](CREDS, params)) as unknown as Row[]
}

async function list(adapter: SquareAdapter, c: Case, params: QueryParams): Promise<string[]> {
  return (await rowsOf(adapter, c, params)).map(c.idOf)
}

describe.each(CASES)('Square $method paging', (c) => {
  it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const L of [3, 50, 120]) {
      _resetCursorPager()
      const { data, ids } = c.seed(2 * L + 1)
      const { calls } = makeServer(data)
      const adapter = new SquareAdapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      let capped = false
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        const rows = await list(adapter, c, params)
        const meta = readUpstreamPage(params)
        // A page the adapter could not size to L (an endpoint ceiling) says so.
        const size = meta?.pageSize ?? L
        expect(rows.length).toBeLessThanOrEqual(size)
        seen.push(...rows)
        hasMore.push(meta?.hasMore)
        if (meta?.pageSize !== undefined) {
          capped = true
          break
        }
      }
      if (!capped) {
        expect(seen).toEqual(ids)
        expect(hasMore).toEqual([true, true, false])
      } else {
        // Only an endpoint whose ceiling is below L may shrink the page, and
        // it must then say so; the ceiling test below walks it to the end.
        expect(L).toBeGreaterThan(c.max)
        expect(seen).toEqual(ids.slice(0, c.max))
        expect(hasMore).toEqual([true])
      }
      for (const call of calls) {
        const limit = call.args['limit']
        if (limit !== undefined) expect(Number(limit)).toBeLessThanOrEqual(c.max)
      }
      vi.restoreAllMocks()
    }
  })

  it('page 2 carries the documented cursor, minted under the original query', async () => {
    // Customers and refunds walk upstream pages of 100 whatever L is, so their
    // page 2 must cross row 100 to need a cursor at all.
    const L = c.method === 'listCustomers' || c.method === 'listRefunds' ? 60 : 40
    const { data, ids } = c.seed(2 * L + 1)
    const { calls, cursorFor } = makeServer(data)
    const adapter = new SquareAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    expect(await list(adapter, c, params)).toEqual(ids.slice(L, 2 * L))
    expect(calls[0]!.args['cursor']).toBeUndefined()
    const sent = calls[0]!.args['limit']
    expect(sent).toBeDefined()
    const cursorCalls = calls.filter((x) => x.args['cursor'] !== undefined)
    expect(cursorCalls.length).toBeGreaterThanOrEqual(1)
    expect(cursorCalls[0]!.args).toEqual({
      ...c.query,
      limit: sent,
      cursor: cursorFor(c.endpoint, Number(sent), { ...c.query, limit: sent }),
    })
    for (const x of calls) expect(x.args['page']).toBeUndefined()
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const MAX = parseListQuery({ limit: '5000', page: '1' }).limit!
    expect(MAX).toBeLessThan(5000)
    const { data, ids } = c.seed(2 * MAX + 1)
    const { calls } = makeServer(data)
    const adapter = new SquareAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(20)
      const params = withPageSink(parseListQuery({ limit: '5000', page: String(page) }))
      const rows = await list(adapter, c, params)
      expect(rows.length).toBeLessThanOrEqual(MAX)
      seen.push(...rows)
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(ids)
    for (const call of calls) {
      const limit = call.args['limit']
      if (limit !== undefined) expect(Number(limit)).toBeLessThanOrEqual(c.max)
    }
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { data, ids } = c.seed(125)
    makeServer(data)
    const adapter = new SquareAdapter()

    const p1 = parseListQuery({ limit: '60', page: '1' })
    const r1 = listPage(await rowsOf(adapter, c, p1), p1, 'square')
    expect(r1.data.map(c.idOf)).toEqual(ids.slice(0, 60))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '60', page: '3' })
    const r3 = listPage(await rowsOf(adapter, c, p3), p3, 'square')
    expect(r3.data.map(c.idOf)).toEqual(ids.slice(120))
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Square advisory limits', () => {
  it.each(CASES.filter((c) => c.endpoint === 'catalog/search' || c.endpoint === 'customers'))(
    '$method serves exact pages when the upstream returns more rows than asked',
    async (c) => {
      const L = 7
      const { data, ids } = c.seed(2 * L + 1)
      makeServer(data, { advisoryExtra: 3 })
      const adapter = new SquareAdapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        const rows = await list(adapter, c, params)
        expect(rows.length).toBeLessThanOrEqual(L)
        seen.push(...rows)
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids)
      expect(hasMore).toEqual([true, true, false])
    },
  )
})

describe('Square listTransactions above the ListPayments ceiling', () => {
  it('asks for 100, reports pageSize 100, and walks every row', async () => {
    const c = CASES.find((x) => x.method === 'listTransactions')!
    const { data, ids } = c.seed(250)
    const { calls } = makeServer(data)
    const adapter = new SquareAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink({ page, limit: 500 } as QueryParams)
      const rows = await list(adapter, c, params)
      expect(readUpstreamPage(params)?.pageSize).toBe(100)
      seen.push(...rows)
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(ids)
    expect(calls.every((x) => x.args['limit'] === 100)).toBe(true)
  })
})

describe('Square listVariants paging', () => {
  /** Items holding 0, 1 or 2 variations in turn, trimmed so the stream has exactly `total`. */
  function uneven(total: number) {
    const counts: number[] = []
    let sum = 0
    for (let i = 0; sum < total; i++) {
      const n = Math.min(i % 3, total - sum)
      counts.push(n)
      sum += n
    }
    const data = emptyData()
    data.catalog = items(counts.length, (i) => counts[i]!)
    const all = data.catalog.flatMap((it) =>
      ((it['item_data'] as { variations: Row[] }).variations ?? []).map(byId),
    )
    return { data, all }
  }

  it('serves 2L+1 variations once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const L of [4, 50, 120]) {
      _resetCursorPager()
      const { data, all } = uneven(2 * L + 1)
      expect(all.length).toBe(2 * L + 1)
      makeServer(data)
      const adapter = new SquareAdapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        seen.push(...(await adapter.listVariants(CREDS, params)).map((v) => v.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(all)
      expect(hasMore).toEqual([true, true, false])
      vi.restoreAllMocks()
    }
  })

  it('page 2 walks the catalog search cursor', async () => {
    const { data, all } = uneven(81)
    const { calls } = makeServer(data)
    const adapter = new SquareAdapter()
    const params = withPageSink({ page: 2, limit: 40 } as QueryParams)
    const rows = (await adapter.listVariants(CREDS, params)).map((v) => v.id)
    expect(rows).toEqual(all.slice(40, 80))
    expect(calls.some((x) => x.path === 'catalog/search' && x.args['cursor'] !== undefined)).toBe(
      true,
    )
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const MAX = parseListQuery({ limit: '5000', page: '1' }).limit!
    const { data, all } = uneven(2 * MAX + 1)
    makeServer(data)
    const adapter = new SquareAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink(parseListQuery({ limit: '5000', page: String(page) }))
      const rows = await adapter.listVariants(CREDS, params)
      expect(rows.length).toBeLessThanOrEqual(MAX)
      seen.push(...rows.map((v) => v.id))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(all)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { data, all } = uneven(125)
    makeServer(data)
    const adapter = new SquareAdapter()
    const p1 = parseListQuery({ limit: '60', page: '1' })
    const r1 = listPage(await adapter.listVariants(CREDS, p1), p1, 'square')
    expect(r1.data.map((v) => v.id)).toEqual(all.slice(0, 60))
    expect(r1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '60', page: '3' })
    const r3 = listPage(await adapter.listVariants(CREDS, p3), p3, 'square')
    expect(r3.data.map((v) => v.id)).toEqual(all.slice(120))
    expect(r3.meta.hasMore).toBe(false)
  })

  it('pages one product’s variations locally', async () => {
    const data = emptyData()
    data.catalog = items(1, () => 7)
    const { calls } = makeServer(data)
    const adapter = new SquareAdapter()
    const all = ((data.catalog[0]!['item_data'] as { variations: Row[] }).variations ?? []).map(
      byId,
    )
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 3, productId: 'ITEM-0001' } as QueryParams)
      seen.push(...(await adapter.listVariants(CREDS, params)).map((v) => v.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(all)
    expect(hasMore).toEqual([true, true, false])
    expect(calls.every((x) => x.path === 'catalog/object/ITEM-0001')).toBe(true)
  })
})

describe('Square listLocations paging', () => {
  it('slices the whole ListLocations response into caller pages', async () => {
    const data = emptyData()
    data.locations = Array.from({ length: 7 }, (_, i) => ({
      id: `LOC-${pad(i)}`,
      name: `l${i}`,
      status: 'ACTIVE',
    }))
    makeServer(data)
    const adapter = new SquareAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 3 } as QueryParams)
      seen.push(...(await adapter.listLocations(CREDS, params)).map((l) => l.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(data.locations.map(byId))
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const data = emptyData()
    data.locations = Array.from({ length: 5 }, (_, i) => ({ id: `LOC-${pad(i)}`, name: 'l' }))
    makeServer(data)
    const adapter = new SquareAdapter()
    const p1 = parseListQuery({ limit: '2', page: '1' })
    const r1 = listPage(await adapter.listLocations(CREDS, p1), p1, 'square')
    expect(r1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '2', page: '3' })
    const r3 = listPage(await adapter.listLocations(CREDS, p3), p3, 'square')
    expect(r3.data.map(byId)).toEqual(['LOC-0005'])
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Square listRefunds for one order', () => {
  it('finds every refund of the order across upstream pages, paged exactly', async () => {
    const data = emptyData()
    // 350 refunds; the order's payments own every 10th one, spread over 4 upstream pages.
    data.refunds = Array.from({ length: 350 }, (_, i) => ({
      id: `REF-${pad(i)}`,
      payment_id: `PAY-${pad(i)}`,
      status: 'COMPLETED',
    }))
    const mine = data.refunds.filter((_, i) => i % 10 === 0)
    data.orders = [
      {
        id: 'ORD-1',
        location_id: 'L1',
        tenders: mine.map((r) => ({ id: `T-${String(r['id'])}`, payment_id: r['payment_id'] })),
      },
    ]
    const { calls } = makeServer(data)
    const adapter = new SquareAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 15, orderId: 'ORD-1' } as QueryParams)
      seen.push(...(await adapter.listRefunds(CREDS, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(mine.map(byId))
    expect(hasMore).toEqual([true, true, false])
    for (const x of calls.filter((y) => y.path === 'refunds'))
      expect(Number(x.args['limit'])).toBeLessThanOrEqual(100)
  })

  it('an order with no payments has no refunds', async () => {
    const data = emptyData()
    data.orders = [{ id: 'ORD-1', location_id: 'L1' }]
    data.refunds = [{ id: 'REF-1', payment_id: 'PAY-1' }]
    const { calls } = makeServer(data)
    const adapter = new SquareAdapter()
    const params = withPageSink({ page: 1, limit: 10, orderId: 'ORD-1' } as QueryParams)
    expect(await adapter.listRefunds(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.some((x) => x.path === 'refunds')).toBe(false)
  })
})

describe('Square explicit upstream cursor', () => {
  it.each(CASES)('$method passes a caller-held cursor straight through', async (c) => {
    const { data, ids } = c.seed(30)
    const { cursorFor } = makeServer(data)
    const adapter = new SquareAdapter()
    // A cursor minted by page 1 at limit 10, as a caller would hold it.
    const sentLimit = 10
    const cursor = cursorFor(c.endpoint, 10, { ...c.query, limit: sentLimit })
    const params = withPageSink({ limit: sentLimit, cursor } as QueryParams)
    expect(await list(adapter, c, params)).toEqual(ids.slice(10, 20))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

describe('Square pager isolation', () => {
  it('keeps two connections apart: page 2 for B never comes from A', async () => {
    const dataA = emptyData()
    dataA.customers = Array.from({ length: 30 }, (_, i) => ({ id: `A-${pad(i)}` }))
    const dataB = emptyData()
    dataB.customers = Array.from({ length: 30 }, (_, i) => ({ id: `B-${pad(i)}` }))
    // Connection A's walk, then connection B's page 2 against B's upstream.
    makeServer(dataA)
    const adapter = new SquareAdapter()
    const credsA = { accessToken: 'token-a' }
    const credsB = { accessToken: 'token-b' }
    const p1 = await adapter.listCustomers(
      credsA,
      withPageSink({ page: 1, limit: 10 } as QueryParams),
    )
    expect(p1.map((x) => x.id)).toEqual(dataA.customers.slice(0, 10).map(byId))
    vi.restoreAllMocks()
    const { calls } = makeServer(dataB)
    const p2 = await adapter.listCustomers(
      credsB,
      withPageSink({ page: 2, limit: 10 } as QueryParams),
    )
    expect(p2.map((x) => x.id)).toEqual(dataB.customers.slice(10, 20).map(byId))
    expect(calls[0]!.args['cursor']).toBeUndefined()
  })
})

/**
 * The pager keys. Each walk remembers where upstream pages start under its key,
 * so a key that leaves out the upstream page size, a filter, or the collection
 * lets one walk resume from another's cursor. The fake upstream answers a
 * cursor replayed under another query with a 400, and a resumed row offset
 * shows up as the wrong rows.
 */
describe('Square pager keys', () => {
  it.each(CASES)('$method: a walk at L=7, then page 2 at L=40, serves rows 40..80', async (c) => {
    const { data, ids } = c.seed(200)
    makeServer(data)
    const adapter = new SquareAdapter()
    const p1 = withPageSink({ page: 1, limit: 7 } as QueryParams)
    expect(await list(adapter, c, p1)).toEqual(ids.slice(0, 7))
    const p2 = withPageSink({ page: 2, limit: 40 } as QueryParams)
    expect(await list(adapter, c, p2)).toEqual(ids.slice(40, 80))
    expect(readUpstreamPage(p2)?.hasMore).toBe(true)
  })

  it('listVariants never resumes from a listProducts walk on the same connection', async () => {
    const data = emptyData()
    data.catalog = items(50, () => 2)
    makeServer(data)
    const adapter = new SquareAdapter()
    const variations = data.catalog.flatMap((it) =>
      (it['item_data'] as { variations: Row[] }).variations.map(byId),
    )
    const products = await adapter.listProducts(
      CREDS,
      withPageSink({ page: 1, limit: 10 } as QueryParams),
    )
    expect(products.map((p) => p.id)).toEqual(data.catalog.slice(0, 10).map(byId))
    const p2 = withPageSink({ page: 2, limit: 10 } as QueryParams)
    const rows = (await adapter.listVariants(CREDS, p2)).map((v) => v.id)
    expect(rows).toEqual(variations.slice(10, 20))
  })

  it('order-filtered refunds never resume from the unfiltered refunds walk', async () => {
    const data = emptyData()
    data.refunds = Array.from({ length: 350 }, (_, i) => ({
      id: `REF-${pad(i)}`,
      payment_id: `PAY-${pad(i)}`,
      status: 'COMPLETED',
    }))
    const mine = data.refunds.filter((_, i) => i % 10 === 0)
    data.orders = [
      {
        id: 'ORD-1',
        location_id: 'L1',
        tenders: mine.map((r) => ({ id: `T-${String(r['id'])}`, payment_id: r['payment_id'] })),
      },
    ]
    makeServer(data)
    const adapter = new SquareAdapter()
    const all = await adapter.listRefunds(
      CREDS,
      withPageSink({ page: 1, limit: 15 } as QueryParams),
    )
    expect(all.map((r) => r.id)).toEqual(data.refunds.slice(0, 15).map(byId))
    const p2 = withPageSink({ page: 2, limit: 15, orderId: 'ORD-1' } as QueryParams)
    expect((await adapter.listRefunds(CREDS, p2)).map((r) => r.id)).toEqual(
      mine.slice(15, 30).map(byId),
    )
  })

  it('listOrders at location LA never lends its cursor to location LB', async () => {
    const data = emptyData()
    data.orders = [
      ...Array.from({ length: 30 }, (_, i) => ({ id: `A-${pad(i)}`, location_id: 'LA' })),
      ...Array.from({ length: 30 }, (_, i) => ({ id: `B-${pad(i)}`, location_id: 'LB' })),
    ]
    makeServer(data)
    const adapter = new SquareAdapter()
    const p1 = withPageSink({ page: 1, limit: 10, location_id: 'LA' } as QueryParams)
    expect((await adapter.listOrders(CREDS, p1)).map((o) => o.id)).toEqual(
      data.orders.slice(0, 10).map(byId),
    )
    const p2 = withPageSink({ page: 2, limit: 10, location_id: 'LB' } as QueryParams)
    expect((await adapter.listOrders(CREDS, p2)).map((o) => o.id)).toEqual(
      data.orders.slice(40, 50).map(byId),
    )
  })

  describe('listInventoryLevels keys on both filters', () => {
    function seedCounts() {
      const data = emptyData()
      for (const loc of ['LA', 'LB'])
        for (let i = 0; i < 60; i++)
          data.counts.push({
            catalog_object_id: `VAR-${pad(i)}`,
            location_id: loc,
            quantity: '1',
            state: 'IN_STOCK',
          })
      return data
    }
    const vars = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => `VAR-${pad(from + i)}`)

    it('a walk over one set of catalog objects never lends its cursor to another', async () => {
      makeServer(seedCounts())
      const adapter = new SquareAdapter()
      const X = vars(0, 30)
      const Y = vars(30, 60)
      const p1 = withPageSink({
        page: 1,
        limit: 10,
        location_id: 'LA',
        catalog_object_ids: X,
      } as unknown as QueryParams)
      expect((await adapter.listInventoryLevels(CREDS, p1)).map((r) => r.id)).toEqual(
        X.slice(0, 10).map((v) => `${v}:LA`),
      )
      const p2 = withPageSink({
        page: 2,
        limit: 10,
        location_id: 'LA',
        catalog_object_ids: Y,
      } as unknown as QueryParams)
      expect((await adapter.listInventoryLevels(CREDS, p2)).map((r) => r.id)).toEqual(
        Y.slice(10, 20).map((v) => `${v}:LA`),
      )
    })

    it('a walk at one location never lends its cursor to another', async () => {
      makeServer(seedCounts())
      const adapter = new SquareAdapter()
      const p1 = withPageSink({ page: 1, limit: 10, location_id: 'LA' } as QueryParams)
      expect((await adapter.listInventoryLevels(CREDS, p1)).map((r) => r.id)).toEqual(
        vars(0, 10).map((v) => `${v}:LA`),
      )
      const p2 = withPageSink({ page: 2, limit: 10, location_id: 'LB' } as QueryParams)
      expect((await adapter.listInventoryLevels(CREDS, p2)).map((r) => r.id)).toEqual(
        vars(10, 20).map((v) => `${v}:LB`),
      )
    })
  })
})
