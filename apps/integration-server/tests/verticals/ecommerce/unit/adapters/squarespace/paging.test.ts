/**
 * Squarespace paging contract: inventory, orders, fulfillments, transactions,
 * products, variants and profiles (customers).
 *
 * Each list below documents exactly one position parameter, `cursor`:
 * "Identifies where the next page of results should begin. Should be the
 * value of pagination.nextPageCursor from a previous response."
 * (https://developers.squarespace.com/commerce-apis/inventory, /orders,
 * /transactions, /products, /profiles). None documents a page-size parameter; each returns "up to
 * 50" items a page. On orders the cursor "Cannot be used with other
 * parameters", and modifiedAfter / modifiedBefore are each "Required when
 * [the other] is passed; cannot be used with cursor". On profiles the cursor
 * also "Cannot be used with other parameters". Products live on the v2 path
 * GET /v2/commerce/products (query: modifiedAfter, modifiedBefore, cursor,
 * query, type) and profiles on GET /1.0/profiles (query: sortDirection,
 * sortField, filter, email, cursor).
 *
 * One upstream page is therefore not one caller page, so the adapter cuts the
 * caller's rows out of the stream (pageByRows). The fake upstream below serves
 * 50 rows a page, honours only `cursor` and the documented filters, ignores
 * anything else, and rejects the combinations the docs forbid.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { SquarespaceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/squarespace/index'

const CREDS = { accessToken: 'sq-key' }
const UPSTREAM_PAGE = 50

type Resource = 'inventory' | 'orders' | 'transactions' | 'products' | 'profiles'

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

const ENVELOPE: Record<Resource, string> = {
  inventory: 'inventory',
  orders: 'result',
  transactions: 'documents',
  products: 'products',
  profiles: 'profiles',
}

const PATH: Record<Resource, string> = {
  inventory: '/1.0/commerce/inventory',
  orders: '/1.0/commerce/orders',
  transactions: '/1.0/commerce/transactions',
  products: '/v2/commerce/products',
  profiles: '/1.0/profiles',
}

/** The query parameters each v2/profiles list documents; the fake rejects any other. */
const DOCUMENTED: Partial<Record<Resource, string[]>> = {
  products: ['modifiedAfter', 'modifiedBefore', 'cursor', 'query', 'type'],
  profiles: ['sortDirection', 'sortField', 'filter', 'email', 'cursor'],
}

function rowFor(resource: Resource, id: string, fulfillments: number): Record<string, unknown> {
  switch (resource) {
    case 'products':
      return {
        id,
        type: 'PHYSICAL',
        storePageId: 'store-page-1',
        name: `Product ${id}`,
        createdOn: '2024-08-25T15:00:00Z',
        modifiedOn: '2024-08-25T15:00:00Z',
        variants: Array.from({ length: fulfillments }, (_, k) => ({
          id: `${id}-v${k}`,
          sku: `${id}-v${k}`,
          pricing: { basePrice: { currency: 'USD', value: 49.99 }, onSale: false },
        })),
      }
    case 'profiles':
      return { id, email: 'bob@example.com', createdOn: '2024-08-25T15:00:00Z' }
    case 'inventory':
      return { variantId: id, sku: id, quantity: 1, isUnlimited: false }
    case 'orders':
      return {
        id,
        orderNumber: id,
        createdOn: '2026-01-01T00:00:00Z',
        modifiedOn: '2026-01-01T00:00:00Z',
        customerEmail: 'a@b.c',
        fulfillmentStatus: 'PENDING',
        lineItems: [],
        grandTotal: { value: '1.00', currency: 'USD' },
        fulfillments: Array.from({ length: fulfillments }, (_, i) => ({
          shipDate: '2026-01-02T00:00:00Z',
          carrierName: 'UPS',
          trackingNumber: `${id}-t${i}`,
        })),
      }
    case 'transactions':
      return {
        id,
        createdOn: '2026-01-01T00:00:00Z',
        modifiedOn: '2026-01-01T00:00:00Z',
        salesOrderId: id,
        total: { value: '1.00', currency: 'USD' },
        payments: [],
      }
  }
}

interface ServerOpts {
  /** Prefix for every id, so two connections' rows can be told apart. */
  prefix?: string
  /**
   * What the last page's pagination says. 'stale-cursor' reports
   * hasNextPage:false but still carries a cursor; 'empty-cursor' omits
   * hasNextPage and sends nextPageCursor ''. Following either would 400.
   */
  lastPage?: 'stale-cursor' | 'empty-cursor'
}

function makeServer(
  resource: Resource,
  rows: number,
  fulfillmentsPer: (i: number) => number = () => 1,
  opts: ServerOpts = {},
) {
  const prefix = opts.prefix ?? ''
  const ids = Array.from(
    { length: rows },
    (_, i) => `${prefix}${resource}-${String(i + 1).padStart(4, '0')}`,
  )
  const calls: Call[] = []
  const cursorFor = (offset: number): string =>
    Buffer.from(`${resource}:${offset}`).toString('base64')
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params: config?.params })
    if (path !== PATH[resource]) throw new Error(`unexpected path in test: ${path}`)
    const bad = (msg: string) =>
      Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
    const documented = DOCUMENTED[resource]
    if (documented) {
      const unknown = Object.keys(params).filter((k) => !documented.includes(k))
      if (unknown.length > 0) throw bad(`undocumented parameter ${unknown.join(',')}`)
    }
    let start = 0
    const cursor = params['cursor']
    if (cursor !== undefined) {
      if (
        (resource === 'orders' || resource === 'profiles') &&
        Object.keys(params).some((k) => k !== 'cursor')
      )
        throw bad('cursor cannot be used with other parameters')
      const m = /^([^:]+):(\d+)$/.exec(Buffer.from(String(cursor), 'base64').toString())
      if (!m || m[1] !== resource || Number(m[2]) >= rows) throw bad('invalid cursor')
      start = Number(m[2])
    }
    if (
      (resource === 'orders' || resource === 'products') &&
      'modifiedAfter' in params !== 'modifiedBefore' in params
    )
      throw bad('modifiedAfter and modifiedBefore must be passed together')
    const slice = ids.slice(start, start + UPSTREAM_PAGE)
    const more = start + UPSTREAM_PAGE < rows
    let pagination: Record<string, unknown> = { hasNextPage: more }
    if (more) {
      pagination['nextPageCursor'] = cursorFor(start + UPSTREAM_PAGE)
      pagination['nextPageUrl'] = `${PATH[resource]}?cursor=x`
    } else if (opts.lastPage === 'stale-cursor') {
      pagination = { hasNextPage: false, nextPageCursor: 'bm90LWEtY3Vyc29y' }
    } else if (opts.lastPage === 'empty-cursor') {
      pagination = { nextPageCursor: '' }
    }
    return {
      data: {
        [ENVELOPE[resource]]: slice.map((id) =>
          rowFor(resource, id, fulfillmentsPer(ids.indexOf(id))),
        ),
        pagination,
      },
    }
  })
  return { get, calls, ids, cursorFor }
}

function fake(
  resource: Resource,
  rows: number,
  fulfillmentsPer?: (i: number) => number,
  opts?: ServerOpts,
) {
  const server = makeServer(resource, rows, fulfillmentsPer, opts)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get, defaults: {} } as never)
  return server
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

interface Case {
  method:
    'listInventoryLevels' | 'listOrders' | 'listTransactions' | 'listProducts' | 'listCustomers'
  resource: Resource
  idOf: (row: Record<string, unknown>) => string
}

const CASES: Case[] = [
  { method: 'listInventoryLevels', resource: 'inventory', idOf: (r) => String(r['variantId']) },
  { method: 'listOrders', resource: 'orders', idOf: (r) => String(r['id']) },
  { method: 'listTransactions', resource: 'transactions', idOf: (r) => String(r['id']) },
  { method: 'listProducts', resource: 'products', idOf: (r) => String(r['id']) },
  { method: 'listCustomers', resource: 'profiles', idOf: (r) => String(r['id']) },
]

async function rowsOf(
  adapter: SquarespaceAdapter,
  c: Case,
  params: QueryParams,
): Promise<Record<string, unknown>[]> {
  return (await adapter[c.method](CREDS, params)) as unknown as Record<string, unknown>[]
}

async function list(adapter: SquarespaceAdapter, c: Case, params: QueryParams): Promise<string[]> {
  return (await rowsOf(adapter, c, params)).map(c.idOf)
}

describe.each(CASES)('Squarespace $method paging', (c) => {
  it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const L of [3, 50, 60]) {
      _resetRowPager()
      const { ids } = fake(c.resource, 2 * L + 1)
      const adapter = new SquarespaceAdapter({ apiKey: 'k' })
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        seen.push(...(await list(adapter, c, params)))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids)
      expect(hasMore).toEqual([true, true, false])
      vi.restoreAllMocks()
    }
  })

  it('page 2 carries the documented cursor and nothing else', async () => {
    const L = 40
    const { calls, cursorFor, ids } = fake(c.resource, 2 * L + 1)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    expect(await list(adapter, c, params)).toEqual(ids.slice(L, 2 * L))
    expect(calls[0]!.params?.['cursor']).toBeUndefined()
    const cursorCalls = calls.filter((x) => x.params?.['cursor'] !== undefined)
    expect(cursorCalls.map((x) => x.params)).toEqual([{ cursor: cursorFor(UPSTREAM_PAGE) }])
    for (const x of calls) expect(x.params?.['pageSize']).toBeUndefined()
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const MAX = parseListQuery({ limit: '5000', page: '1' }).limit!
    expect(MAX).toBeLessThan(5000)
    const { ids } = fake(c.resource, 2 * MAX + 1)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink(parseListQuery({ limit: '5000', page: String(page) }))
      const rows = await list(adapter, c, params)
      expect(rows.length).toBeLessThanOrEqual(MAX)
      seen.push(...rows)
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(ids)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { ids } = fake(c.resource, 125)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })

    const p1 = parseListQuery({ limit: '60', page: '1' })
    const r1 = listPage(await rowsOf(adapter, c, p1), p1, 'squarespace')
    expect(r1.data.map(c.idOf)).toEqual(ids.slice(0, 60))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '60', page: '3' })
    const r3 = listPage(await rowsOf(adapter, c, p3), p3, 'squarespace')
    expect(r3.data.map(c.idOf)).toEqual(ids.slice(120))
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Squarespace listOrders filters', () => {
  it('sends modifiedAfter with a modifiedBefore on page 1, and only the cursor after', async () => {
    const t0 = Date.now()
    const { calls, ids } = fake('orders', 75)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const updatedAfter = new Date('2026-01-01T00:00:00Z')
    const seen: string[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: 40, updatedAfter } as QueryParams)
      seen.push(...(await adapter.listOrders(CREDS, params)).map((o) => o.id))
    }
    expect(seen).toEqual(ids)
    expect(calls[0]!.params?.['modifiedAfter']).toBe(updatedAfter.toISOString())
    const before = Date.parse(String(calls[0]!.params?.['modifiedBefore']))
    // The window closes at now, not at modifiedAfter (an empty window).
    expect(before).toBeGreaterThanOrEqual(t0)
    expect(before).toBeGreaterThan(updatedAfter.getTime())
    expect(Object.keys(calls[0]!.params ?? {}).sort()).toEqual(['modifiedAfter', 'modifiedBefore'])
    expect(calls.slice(1).map((x) => Object.keys(x.params ?? {}))).toEqual([['cursor']])
  })

  it('a different updatedAfter starts a fresh walk (updatedAfter is in the key)', async () => {
    const { calls } = fake('orders', 125)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const x = new Date('2026-01-01T00:00:00Z')
    const y = new Date('2026-02-01T00:00:00Z')
    await adapter.listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 40, updatedAfter: x } as QueryParams),
    )
    await adapter.listOrders(
      CREDS,
      withPageSink({ page: 2, limit: 40, updatedAfter: y } as QueryParams),
    )
    expect(calls.some((c) => c.params?.['modifiedAfter'] === y.toISOString())).toBe(true)
  })
})

describe('Squarespace listTransactions filters', () => {
  it('sends only modifiedAfter on page 1, and only the cursor after', async () => {
    const { calls, ids } = fake('transactions', 75)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const updatedAfter = new Date('2026-01-01T00:00:00Z')
    const seen: string[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: 40, updatedAfter } as QueryParams)
      seen.push(...(await adapter.listTransactions(CREDS, params)).map((t) => t.id))
    }
    expect(seen).toEqual(ids)
    expect(calls.map((x) => x.params)).toEqual([
      { modifiedAfter: updatedAfter.toISOString() },
      { cursor: Buffer.from(`transactions:${UPSTREAM_PAGE}`).toString('base64') },
    ])
  })

  it('a different updatedAfter starts a fresh walk (updatedAfter is in the key)', async () => {
    const { calls } = fake('transactions', 125)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const x = new Date('2026-01-01T00:00:00Z')
    const y = new Date('2026-02-01T00:00:00Z')
    await adapter.listTransactions(
      CREDS,
      withPageSink({ page: 1, limit: 40, updatedAfter: x } as QueryParams),
    )
    await adapter.listTransactions(
      CREDS,
      withPageSink({ page: 2, limit: 40, updatedAfter: y } as QueryParams),
    )
    expect(calls.some((c) => c.params?.['modifiedAfter'] === y.toISOString())).toBe(true)
  })
})

describe('Squarespace pager isolation', () => {
  it('keeps two connections apart: page 2 for B never comes from A', async () => {
    const a = makeServer('orders', 125, () => 1, { prefix: 'A-' })
    const b = makeServer('orders', 125, () => 1, { prefix: 'B-' })
    vi.spyOn(axios, 'create').mockImplementation(((config: {
      headers?: Record<string, string>
    }) => {
      const auth = config.headers?.['Authorization']
      const server = auth === 'Bearer token-a' ? a : auth === 'Bearer token-b' ? b : undefined
      if (!server) throw new Error(`unexpected auth in test: ${auth}`)
      return { get: server.get, defaults: {} }
    }) as never)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const credsA = { accessToken: 'token-a' }
    const credsB = { accessToken: 'token-b' }
    const p1 = await adapter.listOrders(credsA, withPageSink({ page: 1, limit: 40 } as QueryParams))
    expect(p1.map((o) => o.id)).toEqual(a.ids.slice(0, 40))
    const p2 = await adapter.listOrders(credsB, withPageSink({ page: 2, limit: 40 } as QueryParams))
    expect(p2.map((o) => o.id)).toEqual(b.ids.slice(40, 80))
    expect(b.calls[0]!.params?.['cursor']).toBeUndefined()
  })

  it('listFulfillments never reads listOrders rows from the same connection', async () => {
    const server = fake('orders', 125, () => 1)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    await adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 40 } as QueryParams))
    const rows = await adapter.listFulfillments(
      CREDS,
      withPageSink({ page: 2, limit: 40 } as QueryParams),
    )
    expect(rows.map((f) => String(f.trackingNumber))).toEqual(
      server.ids.slice(40, 80).map((id) => `${id}-t0`),
    )
  })
})

describe('Squarespace end of chain', () => {
  describe.each(['stale-cursor', 'empty-cursor'] as const)('last page %s', (lastPage) => {
    it.each(CASES)('$method stops at the last page and reports the end', async (c) => {
      const { ids } = fake(c.resource, 50, undefined, { lastPage })
      const adapter = new SquarespaceAdapter({ apiKey: 'k' })
      const params = withPageSink({ page: 1, limit: 50 } as QueryParams)
      expect(await list(adapter, c, params)).toEqual(ids)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('orders over two pages end with hasMore false', async () => {
      const { ids } = fake('orders', 75, undefined, { lastPage })
      const adapter = new SquarespaceAdapter({ apiKey: 'k' })
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2]) {
        const params = withPageSink({ page, limit: 40 } as QueryParams)
        seen.push(...(await adapter.listOrders(CREDS, params)).map((o) => o.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids)
      expect(hasMore).toEqual([true, false])
    })
  })
})

describe('Squarespace listFulfillments paging', () => {
  const tracking = (f: { trackingNumber?: string }) => String(f.trackingNumber)

  /**
   * Orders holding 0, 1 or 2 shipments in turn, with the last order trimmed
   * so the flattened stream has exactly `total` shipments. Rows come out of
   * pages of 50 orders, so no caller page lines up with an upstream page.
   */
  function uneven(total: number) {
    const counts: number[] = []
    let sum = 0
    for (let i = 0; sum < total; i++) {
      const n = Math.min(i % 3, total - sum)
      counts.push(n)
      sum += n
    }
    const server = fake('orders', counts.length, (i) => counts[i]!)
    const all = server.ids.flatMap((id, i) =>
      Array.from({ length: counts[i]! }, (_, k) => `${id}-t${k}`),
    )
    return { ...server, all }
  }

  it('serves 2L+1 shipments once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const L of [4, 50, 70]) {
      _resetRowPager()
      const { all } = uneven(2 * L + 1)
      expect(all.length).toBe(2 * L + 1)
      const adapter = new SquarespaceAdapter({ apiKey: 'k' })
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        seen.push(...(await adapter.listFulfillments(CREDS, params)).map(tracking))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(all)
      expect(hasMore).toEqual([true, true, false])
      vi.restoreAllMocks()
    }
  })

  it('page 2 carries the documented cursor and nothing else', async () => {
    const L = 30
    const server = fake('orders', 2 * L + 1, () => 1)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = (await adapter.listFulfillments(CREDS, params)).map(tracking)
    expect(rows).toEqual(server.ids.slice(L, 2 * L).map((id) => `${id}-t0`))
    const cursorCalls = server.calls.filter((x) => x.params?.['cursor'] !== undefined)
    expect(cursorCalls.map((x) => x.params)).toEqual([{ cursor: server.cursorFor(UPSTREAM_PAGE) }])
    for (const x of server.calls) expect(x.params?.['pageSize']).toBeUndefined()
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const MAX = parseListQuery({ limit: '5000', page: '1' }).limit!
    const { all } = uneven(2 * MAX + 1)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink(parseListQuery({ limit: '5000', page: String(page) }))
      const rows = await adapter.listFulfillments(CREDS, params)
      expect(rows.length).toBeLessThanOrEqual(MAX)
      seen.push(...rows.map(tracking))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(all)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const server = fake('orders', 120, () => 1)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const p1 = parseListQuery({ limit: '100', page: '1' })
    const r1 = listPage(await adapter.listFulfillments(CREDS, p1), p1, 'squarespace')
    expect(r1.data.map(tracking)).toEqual(server.ids.slice(0, 100).map((id) => `${id}-t0`))
    expect(r1.meta.hasMore).toBe(true)
    const p2 = parseListQuery({ limit: '100', page: '2' })
    const r2 = listPage(await adapter.listFulfillments(CREDS, p2), p2, 'squarespace')
    expect(r2.data.map(tracking)).toEqual(server.ids.slice(100).map((id) => `${id}-t0`))
    expect(r2.meta.hasMore).toBe(false)
  })
})

describe('Squarespace listProducts filters (GET /v2/commerce/products)', () => {
  it('sends modifiedAfter with a modifiedBefore on page 1, and only the cursor after', async () => {
    const t0 = Date.now()
    const { calls, ids } = fake('products', 75)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const updatedAfter = new Date('2026-01-01T00:00:00Z')
    const seen: string[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: 40, updatedAfter } as QueryParams)
      seen.push(...(await adapter.listProducts(CREDS, params)).map((p) => p.id))
    }
    expect(seen).toEqual(ids)
    expect(calls.every((c) => c.path === '/v2/commerce/products')).toBe(true)
    expect(calls[0]!.params?.['modifiedAfter']).toBe(updatedAfter.toISOString())
    expect(Date.parse(String(calls[0]!.params?.['modifiedBefore']))).toBeGreaterThanOrEqual(t0)
    expect(Object.keys(calls[0]!.params ?? {}).sort()).toEqual(['modifiedAfter', 'modifiedBefore'])
    expect(calls.slice(1).map((x) => Object.keys(x.params ?? {}))).toEqual([['cursor']])
  })

  it('an unfiltered first page sends no query parameters at all', async () => {
    const { calls } = fake('products', 10)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams))
    expect(calls.map((c) => c.params ?? {})).toEqual([{}])
  })

  it('a different updatedAfter starts a fresh walk (updatedAfter is in the key)', async () => {
    const { calls } = fake('products', 125)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const x = new Date('2026-01-01T00:00:00Z')
    const y = new Date('2026-02-01T00:00:00Z')
    await adapter.listProducts(
      CREDS,
      withPageSink({ page: 1, limit: 40, updatedAfter: x } as QueryParams),
    )
    await adapter.listProducts(
      CREDS,
      withPageSink({ page: 2, limit: 40, updatedAfter: y } as QueryParams),
    )
    expect(calls.some((c) => c.params?.['modifiedAfter'] === y.toISOString())).toBe(true)
  })
})

describe('Squarespace listCustomers (GET /1.0/profiles)', () => {
  it('documents no modification filter: updatedAfter sends nothing, later pages only the cursor', async () => {
    const { calls, ids } = fake('profiles', 75)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const updatedAfter = new Date('2026-01-01T00:00:00Z')
    const seen: string[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: 40, updatedAfter } as QueryParams)
      seen.push(...(await adapter.listCustomers(CREDS, params)).map((c) => c.id))
    }
    expect(seen).toEqual(ids)
    expect(calls.map((x) => x.params ?? {})).toEqual([
      {},
      { cursor: Buffer.from(`profiles:${UPSTREAM_PAGE}`).toString('base64') },
    ])
  })
})

describe('Squarespace listVariants paging (variants flattened from /v2/commerce/products)', () => {
  /**
   * Products holding 0, 1 or 2 variants in turn, the last one trimmed so the
   * flattened stream has exactly `total` variants; upstream pages hold 50
   * products, so no caller page lines up with an upstream page.
   */
  function uneven(total: number) {
    const counts: number[] = []
    let sum = 0
    for (let i = 0; sum < total; i++) {
      const n = Math.min(i % 3, total - sum)
      counts.push(n)
      sum += n
    }
    const server = fake('products', counts.length, (i) => counts[i]!)
    const all = server.ids.flatMap((id, i) =>
      Array.from({ length: counts[i]! }, (_, k) => `${id}-v${k}`),
    )
    return { ...server, counts, all }
  }

  it('serves 2L+1 variants once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const L of [4, 50, 70]) {
      _resetRowPager()
      const { all, counts } = uneven(2 * L + 1)
      expect(all.length).toBe(2 * L + 1)
      // At least one upstream page holds a number of variants other than L.
      expect(counts.slice(0, UPSTREAM_PAGE).reduce((a, b) => a + b, 0)).not.toBe(L)
      const adapter = new SquarespaceAdapter({ apiKey: 'k' })
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        const rows = await adapter.listVariants(CREDS, params)
        seen.push(...rows.map((v) => v.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(all)
      expect(hasMore).toEqual([true, true, false])
      vi.restoreAllMocks()
    }
  })

  it('each variant carries its parent productId', async () => {
    const { ids } = uneven(5)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const rows = await adapter.listVariants(
      CREDS,
      withPageSink({ page: 1, limit: 5 } as QueryParams),
    )
    for (const v of rows) expect(ids).toContain(v.productId)
    expect(rows.map((v) => `${v.productId}-v`)).toEqual(rows.map((v) => v.id.replace(/\d+$/, '')))
  })

  it('a different updatedAfter starts a fresh walk (updatedAfter is in the key)', async () => {
    const { calls } = fake('products', 125, () => 1)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const x = new Date('2026-01-01T00:00:00Z')
    const y = new Date('2026-02-01T00:00:00Z')
    await adapter.listVariants(
      CREDS,
      withPageSink({ page: 1, limit: 40, updatedAfter: x } as QueryParams),
    )
    await adapter.listVariants(
      CREDS,
      withPageSink({ page: 2, limit: 40, updatedAfter: y } as QueryParams),
    )
    expect(calls.some((c) => c.params?.['modifiedAfter'] === y.toISOString())).toBe(true)
  })

  it('never reads listProducts rows from the same connection', async () => {
    const server = fake('products', 125, () => 1)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 40 } as QueryParams))
    const rows = await adapter.listVariants(
      CREDS,
      withPageSink({ page: 2, limit: 40 } as QueryParams),
    )
    expect(rows.map((v) => v.id)).toEqual(server.ids.slice(40, 80).map((id) => `${id}-v0`))
  })
})

describe('Squarespace get* read-back paths', () => {
  function single(path: string, body: Record<string, unknown>) {
    const calls: Call[] = []
    const get = vi.fn(async (p: string, config?: { params?: Record<string, unknown> }) => {
      calls.push({ path: p, params: config?.params })
      if (p !== path) throw new Error(`unexpected path in test: ${p}`)
      return { data: body }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
    return calls
  }

  it('getProduct reads GET /v2/commerce/products/{id} and its products envelope', async () => {
    const product = rowFor('products', 'p1', 2)
    const calls = single('/v2/commerce/products/p1', { products: [product] })
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const got = await adapter.getProduct(CREDS, 'p1')
    expect(got.id).toBe('p1')
    expect(got.variants?.map((v) => v.id)).toEqual(['p1-v0', 'p1-v1'])
    expect(calls.map((c) => c.params ?? {})).toEqual([{}])
  })

  it('getProduct takes the envelope entry whose id matches, not the first', async () => {
    single('/v2/commerce/products/p1', {
      products: [rowFor('products', 'p0', 1), rowFor('products', 'p1', 1)],
    })
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    expect((await adapter.getProduct(CREDS, 'p1')).id).toBe('p1')
  })

  it('getProduct 404s when the envelope holds only other ids', async () => {
    single('/v2/commerce/products/p1', { products: [rowFor('products', 'p0', 1)] })
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    await expect(adapter.getProduct(CREDS, 'p1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getProduct 404s when the envelope does not hold the id', async () => {
    single('/v2/commerce/products/p1', { products: [] })
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    await expect(adapter.getProduct(CREDS, 'p1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getCustomer reads GET /1.0/profiles/{id} and its profiles envelope', async () => {
    single('/1.0/profiles/c1', { profiles: [rowFor('profiles', 'c1', 0)] })
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const got = await adapter.getCustomer(CREDS, 'c1')
    expect(got.id).toBe('c1')
    expect(got.email).toBe('bob@example.com')
  })

  it('getCustomer takes the envelope entry whose id matches, not the first', async () => {
    single('/1.0/profiles/c1', {
      profiles: [rowFor('profiles', 'c0', 0), rowFor('profiles', 'c1', 0)],
    })
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    expect((await adapter.getCustomer(CREDS, 'c1')).id).toBe('c1')
  })

  it('getCustomer 404s when the envelope holds only other ids', async () => {
    single('/1.0/profiles/c1', { profiles: [rowFor('profiles', 'c0', 0)] })
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    await expect(adapter.getCustomer(CREDS, 'c1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getCustomer 404s when the envelope does not hold the id', async () => {
    single('/1.0/profiles/c1', { profiles: [] })
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    await expect(adapter.getCustomer(CREDS, 'c1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getVariant with productId:variantId reads that product', async () => {
    single('/v2/commerce/products/p1', { products: [rowFor('products', 'p1', 2)] })
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const got = await adapter.getVariant(CREDS, 'p1:p1-v1')
    expect(got.id).toBe('p1-v1')
    expect(got.productId).toBe('p1')
  })

  it('getVariant with a bare id (as listVariants returns) walks every products page', async () => {
    const server = fake('products', 120, () => 1)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    const target = `${server.ids[110]}-v0`
    const got = await adapter.getVariant(CREDS, target)
    expect(got.id).toBe(target)
    expect(got.productId).toBe(server.ids[110])
    expect(server.calls.map((c) => c.params ?? {})).toEqual([
      {},
      { cursor: server.cursorFor(50) },
      { cursor: server.cursorFor(100) },
    ])
  })

  it('getVariant 404s after the last products page', async () => {
    fake('products', 60, () => 1)
    const adapter = new SquarespaceAdapter({ apiKey: 'k' })
    await expect(adapter.getVariant(CREDS, 'nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})
