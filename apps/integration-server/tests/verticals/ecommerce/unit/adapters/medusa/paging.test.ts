/**
 * Medusa list paging contract.
 *
 * Medusa's Admin API reference (https://docs.medusajs.com/api/admin#pagination):
 *
 *   "Use the offset query parameter to change between pages. For example, if
 *   the limit is 50, at page 1 the offset should be 0; at page 2 the offset
 *   should be 50, and so on."
 *
 *   "count: the total number of available items of this data model. It can be
 *   used to determine how many pages are there."
 *
 * No maximum `limit` is documented. The adapter sends at most 100 rows a
 * request (its own ceiling), so a larger caller limit is served at 100 and
 * reported as such.
 *
 * - products, collections, locations, customers, orders, transactions,
 *   discounts: one upstream page is one caller page (offset = (page-1)×size).
 * - inventory levels are flattened out of inventory items (one per location
 *   level), so one upstream page is not one caller page (pageByRows).
 *
 * The fake upstream honours only `limit` and `offset`, and reports `count`.
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
import type { Credentials, QueryParams } from '@opensteward/shared'
import { MedusaAdapter } from '../../../../../../src/verticals/ecommerce/adapters/medusa/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS: Credentials = {
  accessToken: 'sk_test',
  extra: { host: 'https://medusa.example.com' },
}
/** The adapter's own per-request ceiling (undocumented upstream). */
const SENT_MAX = 100
const UPSTREAM_DEFAULT = 50

type Raw = Record<string, unknown>

interface Call {
  path: string
  params: Record<string, unknown>
}

const KEY: Record<string, string> = {
  '/products': 'products',
  '/collections': 'collections',
  '/stock-locations': 'stock_locations',
  '/inventory-items': 'inventory_items',
  '/customers': 'customers',
  '/orders': 'orders',
  '/payments': 'payments',
  '/promotions': 'promotions',
}

interface ServerOpts {
  /** Omit `count` from every response. */
  noCount?: boolean
  /** Serve at most this many rows a response, whatever `limit` asks for. */
  cap?: number
}

function makeServer(data: Partial<Record<string, Raw[]>>, opts: ServerOpts = {}) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    const all = data[path]
    const key = KEY[path]
    if (!all || !key) throw new Error(`unexpected path in test: ${path}`)
    // `q` is honoured as a substring match over the row, like Medusa's search.
    const q = params['q']
    const rows = typeof q === 'string' ? all.filter((r) => JSON.stringify(r).includes(q)) : all
    const asked = params['limit'] === undefined ? UPSTREAM_DEFAULT : Number(params['limit'])
    const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
    if (!Number.isInteger(asked) || asked < 1 || !Number.isInteger(offset) || offset < 0)
      throw Object.assign(new Error('400 bad paging'), { response: { status: 400 } })
    const limit = Math.min(asked, opts.cap ?? asked)
    const body: Raw = { [key]: rows.slice(offset, offset + limit), offset, limit }
    if (!opts.noCount) body['count'] = rows.length
    return { data: body }
  })
  return { get, calls }
}

function fake(data: Partial<Record<string, Raw[]>>, opts: ServerOpts = {}) {
  const server = makeServer(data, opts)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get, defaults: {} } as never)
  return server
}

const pad = (i: number): string => String(i + 1).padStart(4, '0')

/** `n` inventory levels over items holding 1 and 2 location levels, in order. */
function inventoryItems(n: number): { items: Raw[]; ids: string[] } {
  const out: Raw[] = []
  const ids: string[] = []
  let v = 0
  for (let i = 0; v < n; i++) {
    const count = Math.min((i % 2) + 1, n - v)
    const id = `iitem_${pad(i)}`
    const levels = Array.from({ length: count }, () => {
      const loc = `sloc_${pad(v++)}`
      ids.push(`${id}:${loc}`)
      return { location_id: loc, stocked_quantity: 1, reserved_quantity: 0 }
    })
    out.push({ id, sku: `SKU-${i}`, location_levels: levels })
  }
  return { items: out, ids }
}

type Method =
  | 'listProducts'
  | 'listCollections'
  | 'listLocations'
  | 'listInventoryLevels'
  | 'listCustomers'
  | 'listOrders'
  | 'listTransactions'
  | 'listDiscounts'

interface Case {
  method: Method
  path: string
  kind: 'offset' | 'rows'
  build: (n: number) => { data: Partial<Record<string, Raw[]>>; ids: string[] }
}

const simple = (path: string, prefix: string) => (n: number) => {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `${prefix}_${pad(i)}` }))
  return { data: { [path]: rows }, ids: rows.map((r) => r.id) }
}

const CASES: Case[] = [
  { method: 'listProducts', path: '/products', kind: 'offset', build: simple('/products', 'prod') },
  {
    method: 'listCollections',
    path: '/collections',
    kind: 'offset',
    build: simple('/collections', 'pcol'),
  },
  {
    method: 'listLocations',
    path: '/stock-locations',
    kind: 'offset',
    build: simple('/stock-locations', 'sloc'),
  },
  {
    method: 'listCustomers',
    path: '/customers',
    kind: 'offset',
    build: simple('/customers', 'cus'),
  },
  { method: 'listOrders', path: '/orders', kind: 'offset', build: simple('/orders', 'order') },
  {
    method: 'listTransactions',
    path: '/payments',
    kind: 'offset',
    build: simple('/payments', 'pay'),
  },
  {
    method: 'listDiscounts',
    path: '/promotions',
    kind: 'offset',
    build: simple('/promotions', 'promo'),
  },
  {
    method: 'listInventoryLevels',
    path: '/inventory-items',
    kind: 'rows',
    build: (n) => {
      const { items, ids } = inventoryItems(n)
      return { data: { '/inventory-items': items }, ids }
    },
  },
]

async function list(
  adapter: MedusaAdapter,
  method: Method,
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<string[]> {
  const rows = (await adapter[method](creds, params)) as { id: string }[]
  return rows.map((r) => r.id)
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe('Medusa list paging', () => {
  it('declares no maxPageSize: variants, fulfillments and refunds are unpaged nested reads', () => {
    expect(new MedusaAdapter().capabilities).not.toHaveProperty('maxPageSize')
  })

  for (const c of CASES) {
    describe(c.method, () => {
      // L = 60 makes the row-pager method cross upstream pages of 100.
      const sizes = c.kind === 'rows' ? [3, 60] : [3, 17]

      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of sizes) {
          _resetRowPager()
          vi.restoreAllMocks()
          const { data, ids } = c.build(2 * L + 1)
          fake(data)
          const a = new MedusaAdapter()
          const seen: string[] = []
          const hasMore: (boolean | undefined)[] = []
          for (const page of [1, 2, 3]) {
            const params = withPageSink({ page, limit: L } as QueryParams)
            seen.push(...(await list(a, c.method, params)))
            hasMore.push(readUpstreamPage(params)?.hasMore)
          }
          expect(seen).toEqual(ids)
          expect(hasMore).toEqual([true, true, false])
        }
      })

      it('the page-2 request carries the documented offset and limit', async () => {
        const L = 7
        const { data, ids } = c.build(2 * L + 1)
        const { calls } = fake(data)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        expect(await list(new MedusaAdapter(), c.method, params)).toEqual(ids.slice(L, 2 * L))
        expect(calls.every((x) => x.path === c.path)).toBe(true)
        if (c.kind === 'offset') {
          expect(calls).toHaveLength(1)
          expect(calls[0]!.params['limit']).toBe(L)
          expect(calls[0]!.params['offset']).toBe(L)
        } else {
          // Inventory items are fetched at a fixed size and cut into caller rows.
          expect(calls.every((x) => x.params['limit'] === SENT_MAX)).toBe(true)
          expect(calls[0]!.params['offset']).toBe(0)
        }
      })

      if (c.kind === 'rows') {
        it('a caller page past the first item page asks for the next offset', async () => {
          // 301 levels sit on 201 items: caller page 2 at 150 needs items 100..200.
          const { data, ids } = c.build(301)
          const { calls } = fake(data)
          const params = withPageSink({ page: 2, limit: 150 } as QueryParams)
          expect(await list(new MedusaAdapter(), c.method, params)).toEqual(ids.slice(150, 300))
          expect(readUpstreamPage(params)?.hasMore).toBe(true)
          expect(calls.map((x) => x.params['offset'])).toEqual([0, 100, 200])
          expect(calls.every((x) => x.params['limit'] === SENT_MAX)).toBe(true)
        })
      }

      it('clamps a limit above 100 and still serves every row', async () => {
        const { data, ids } = c.build(2 * SENT_MAX + 1)
        const { calls } = fake(data)
        const a = new MedusaAdapter()
        const seen: string[] = []
        for (let page = 1; ; page++) {
          expect(page).toBeLessThan(10)
          const params = withPageSink({ page, limit: 150 } as QueryParams)
          const got = await list(a, c.method, params)
          expect(got.length).toBeLessThanOrEqual(150)
          seen.push(...got)
          const meta = readUpstreamPage(params)
          if (c.kind === 'offset') expect(meta?.pageSize).toBe(SENT_MAX)
          if (!meta?.hasMore) break
        }
        expect(seen).toEqual(ids)
        for (const x of calls) expect(x.params['limit']).toBeLessThanOrEqual(SENT_MAX)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const { data, ids } = c.build(25)
        fake(data)
        const a = new MedusaAdapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a as EcommerceAdapter)
        const r1 = listPage((await a[c.method](CREDS, p1)) as { id: string }[], p1, 'medusa')
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a as EcommerceAdapter)
        const r3 = listPage((await a[c.method](CREDS, p3)) as { id: string }[], p3, 'medusa')
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })
    })
  }

  describe('filters', () => {
    const since = new Date('2026-01-02T03:04:05.000Z')
    for (const c of CASES) {
      it(`${c.method} forwards search and updatedAfter on every request`, async () => {
        const { data } = c.build(5)
        const { calls } = fake(data)
        const params = withPageSink({
          page: 1,
          limit: 5,
          search: '0',
          updatedAfter: since,
        } as QueryParams)
        await list(new MedusaAdapter(), c.method, params)
        expect(calls.length).toBeGreaterThan(0)
        for (const x of calls) {
          expect(x.params['q']).toBe('0')
          expect(x.params['updated_at']).toEqual({ gte: since.toISOString() })
        }
      })
    }

    it('a filtered inventory walk never reuses an unfiltered walk', async () => {
      // Every third item carries the searched sku; the fake honours `q`.
      const items = Array.from({ length: 60 }, (_, i) => ({
        id: `iitem_${pad(i)}`,
        sku: i % 3 === 0 ? `HIT-${i}` : `SKU-${i}`,
        location_levels: [{ location_id: 'sloc_1', stocked_quantity: 1, reserved_quantity: 0 }],
      }))
      const hits = items.filter((r) => r.sku.startsWith('HIT')).map((r) => `${r.id}:sloc_1`)
      const { calls } = fake({ '/inventory-items': items })
      const a = new MedusaAdapter()
      await list(a, 'listInventoryLevels', withPageSink({ page: 1, limit: 5 } as QueryParams))
      const before = calls.length
      const got = await list(
        a,
        'listInventoryLevels',
        withPageSink({ page: 2, limit: 5, search: 'HIT' } as QueryParams),
      )
      expect(got).toEqual(hits.slice(5, 10))
      expect(calls.slice(before).length).toBeGreaterThan(0)
      expect(calls.slice(before).every((x) => x.params['q'] === 'HIT')).toBe(true)
    })
  })

  it('an offset page that comes back empty below `count` ends the walk', async () => {
    const get = vi.fn(async () => ({ data: { products: [], count: 50 } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
    const params = withPageSink({ page: 2, limit: 5 } as QueryParams)
    expect(await list(new MedusaAdapter(), 'listProducts', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('inventory without `count` keeps walking while item pages come back full', async () => {
    const { items, ids } = inventoryItems(225) // 150 items
    const { calls } = fake({ '/inventory-items': items }, { noCount: true })
    const params = withPageSink({ page: 1, limit: 200 } as QueryParams)
    expect(await list(new MedusaAdapter(), 'listInventoryLevels', params)).toEqual(
      ids.slice(0, 200),
    )
    expect(calls.map((x) => x.params['offset'])).toEqual([0, 100])
  })

  it('inventory strides by the items returned when the upstream serves a short page', async () => {
    const { items, ids } = inventoryItems(60) // 40 items
    const { calls } = fake({ '/inventory-items': items }, { cap: 15 })
    const params = withPageSink({ page: 1, limit: 60 } as QueryParams)
    expect(await list(new MedusaAdapter(), 'listInventoryLevels', params)).toEqual(ids)
    expect(calls.map((x) => x.params['offset'])).toEqual([0, 15, 30])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('inventory without a caller limit serves pages of 20', async () => {
    const { items, ids } = inventoryItems(50)
    fake({ '/inventory-items': items })
    const params = withPageSink({ page: 2 } as QueryParams)
    expect(await list(new MedusaAdapter(), 'listInventoryLevels', params)).toEqual(
      ids.slice(20, 40),
    )
  })

  it('a response without `count` reports no total and no guessed hasMore', async () => {
    const get = vi.fn(async () => ({ data: { products: [{ id: 'prod_0001' }] } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
    const params = withPageSink({ page: 1, limit: 5 } as QueryParams)
    expect(await list(new MedusaAdapter(), 'listProducts', params)).toEqual(['prod_0001'])
    const meta = readUpstreamPage(params)
    expect(meta?.totalCount).toBeUndefined()
    expect(meta?.hasMore).toBeUndefined()
  })

  it('two connections never share an inventory walk', async () => {
    const a = makeServer({ '/inventory-items': inventoryItems(15).items })
    const bItems = inventoryItems(15).items.map((r) => ({ ...r, id: `B${String(r['id'])}` }))
    const b = makeServer({ '/inventory-items': bItems })
    vi.spyOn(axios, 'create').mockImplementation(((config?: {
      headers?: Record<string, string>
    }) => {
      const auth = config?.headers?.['Authorization'] ?? ''
      const server = { 'Bearer sk_a': a, 'Bearer sk_b': b }[auth]
      if (!server) throw new Error(`no fake account for ${auth}`)
      return { get: server.get, defaults: {} }
    }) as never)
    const adapter = new MedusaAdapter()
    const host = { host: 'https://medusa.example.com' }
    const ra = await list(
      adapter,
      'listInventoryLevels',
      withPageSink({ page: 1, limit: 5 } as QueryParams),
      { accessToken: 'sk_a', extra: host },
    )
    expect(ra[0]).toBe('iitem_0001:sloc_0001')
    const rb = await list(
      adapter,
      'listInventoryLevels',
      withPageSink({ page: 2, limit: 5 } as QueryParams),
      { accessToken: 'sk_b', extra: host },
    )
    expect(rb.every((id) => id.startsWith('Biitem_'))).toBe(true)
    expect(b.calls.length).toBeGreaterThan(0)
  })
})
