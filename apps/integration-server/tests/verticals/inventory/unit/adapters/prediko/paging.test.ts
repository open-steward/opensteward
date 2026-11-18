/**
 * Prediko warehouses, suppliers and purchase orders are unpaginated: the
 * adapter fetches each whole collection and slices it into the caller's pages.
 *
 * Prediko's pagination guide (https://api.prediko.io/docs/guides/pagination/):
 *
 *   "The SKUs endpoint is the only paginated endpoint in the Prediko API. All
 *    other endpoints (Orders, Suppliers, Locations) return complete result
 *    sets."
 *
 * Its table lists /api/v1/warehouses, /api/v1/suppliers and /api/v1/orders as
 * "No (returns all)". The endpoint reference pages document only filters, and
 * a `{ data, total }` response:
 *
 *   GET /api/v1/warehouses  include_raw_material
 *   GET /api/v1/suppliers   name
 *   GET /api/v1/orders      order_status, order_types, updated_after,
 *                           date_from, date_to, supplier_names
 *
 * Before the fix each method returned the whole collection for every caller
 * page: the router truncated it to `limit`, page 2 repeated page 1, and rows
 * past the first page were unreachable.
 *
 * The fake below honours ONLY what those pages document. It refuses any query
 * parameter that is not a documented filter (a `limit`, `offset` or `page`
 * would be one) and answers every request with the whole collection.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'
import { PredikoAdapter } from '../../../../../../src/verticals/inventory/adapters/prediko/index'

const CREDS = { accessToken: 'pk_live_test' }

/**
 * No case needs more than a handful of upstream reads. A loop that keeps
 * paging past the end fails by name instead of hanging the worker.
 */
const CALL_BUDGET = 20

/** The query parameters each endpoint's reference page documents: filters only. */
const DOCUMENTED_PARAMS: Readonly<Record<string, readonly string[]>> = {
  '/warehouses': ['include_raw_material'],
  '/suppliers': ['name'],
  '/orders': [
    'order_status',
    'order_types',
    'updated_after',
    'date_from',
    'date_to',
    'supplier_names',
  ],
}

type Method = 'listLocations' | 'listSuppliers' | 'listPurchaseOrders'

interface Case {
  method: Method
  path: string
  prefix: string
  row: (id: string, i: number) => Record<string, unknown>
}

const CASES: Case[] = [
  {
    method: 'listLocations',
    path: '/warehouses',
    prefix: 'wh',
    row: (id, i) => ({ id, name: `Warehouse ${i}`, active: true }),
  },
  {
    method: 'listSuppliers',
    path: '/suppliers',
    prefix: 'sup',
    row: (id, i) => ({ id, name: `Supplier ${i}`, emails: [], currency: 'USD' }),
  },
  {
    method: 'listPurchaseOrders',
    path: '/orders',
    prefix: 'po',
    row: (id, i) => ({
      id,
      reference: `PO-${i}`,
      order_status: 'DRAFT',
      supplier_name: 'Acme',
      created_at: '2026-01-01T00:00:00Z',
      order_parts: [],
    }),
  },
]

function ids(c: Case, start: number, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `${c.prefix}-${String(start + i).padStart(5, '0')}`,
  )
}

interface Seen {
  path: string
  params: Record<string, unknown> | undefined
}

type Row = Record<string, unknown>

/**
 * Row i (1-based) was last updated i hours into 2026. The Order object
 * documents no such field, so the fake keeps it server-side.
 */
const updatedAt = (i: number): number => Date.UTC(2026, 0, 1) + i * 3_600_000

interface FakeOptions {
  /** Answer with this body instead of `{ data, total }`. */
  body?: unknown
  /**
   * The order the platform returns the rows in on its `call`-th read (0-based).
   * Nothing documents one, so a test may pick any, and change it between reads.
   */
  order?: (rows: Row[], call: number) => Row[]
}

/**
 * A fake Prediko at the axios seam the client uses. Every GET to a list
 * endpoint answers with the whole collection in `{ data, total }`, whatever
 * page the caller is on, because the platform has no paging parameter. The one
 * filter it applies is /orders' `updated_after`: it keeps the orders updated
 * after that instant, and `total` counts only those.
 */
function fakePrediko(c: Case, total: number, opts: FakeOptions = {}) {
  const all = ids(c, 1, total).map((id, i) => c.row(id, i + 1))
  const seen: Seen[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (seen.length >= CALL_BUDGET) {
      throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
    }
    const call = seen.length
    seen.push({ path, params: config?.params })
    const documented = DOCUMENTED_PARAMS[path]
    if (!documented || path !== c.path) {
      throw Object.assign(new Error(`unexpected GET ${path}`), { response: { status: 404 } })
    }
    const undocumented = Object.keys(config?.params ?? {}).filter((k) => !documented.includes(k))
    if (undocumented.length > 0) {
      throw Object.assign(new Error(`GET ${path} documents no ${undocumented.join(', ')}`), {
        response: { status: 400 },
      })
    }
    let rows = all
    const after = config?.params?.updated_after
    if (after !== undefined) {
      const bound = Date.parse(String(after))
      if (Number.isNaN(bound)) {
        throw Object.assign(new Error(`updated_after is not ISO 8601: ${String(after)}`), {
          response: { status: 400 },
        })
      }
      rows = all.filter((_, i) => updatedAt(i + 1) > bound)
    }
    if (opts.order) rows = opts.order([...rows], call)
    return { data: opts.body === undefined ? { data: rows, total: rows.length } : opts.body }
  })
  const post = vi.fn(async () => {
    throw new Error('no POST is expected from these list methods')
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post } as unknown as ReturnType<
    typeof axios.create
  >)
  return { seen }
}

const adapter = () => new PredikoAdapter({})

/**
 * parseListQuery as the router calls it. The router hands over the adapter the
 * inventory registry built (`factory(PredikoAdapter)`, typed InventoryAdapter),
 * so a declared `capabilities.maxPageSize` can clamp the limit.
 */
const routerParams = (query: Record<string, string>): QueryParams => {
  const registered: InventoryAdapter = adapter()
  return parseListQuery(query, registered)
}

/**
 * One case's list method. The three return Location[], Supplier[] or
 * PurchaseOrder[] by case; every assertion here reads only the `id` all three
 * canonical rows carry, and what listPage publishes about them.
 */
const list = (c: Case, params: QueryParams): Promise<Array<{ id: string }>> =>
  adapter()[c.method](CREDS, params)

const call = async (c: Case, params: QueryParams): Promise<string[]> =>
  (await list(c, params)).map((r) => r.id)

/** Drive a method as the sync worker does: withPageSink({ page, limit }) for pages 1..n. */
async function walk(c: Case, limit: number, pages = 3, filters: QueryParams = {}) {
  const served: string[] = []
  const sizes: number[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ ...filters, page, limit })
    const rows = await call(c, params)
    served.push(...rows)
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { served, sizes, hasMore }
}

afterEach(() => vi.restoreAllMocks())

describe.each(CASES)('prediko $method paging (GET $path, unpaginated)', (c) => {
  it('N = 2L + 1: three worker pages serve every row once, hasMore [true, true, false]', async () => {
    const L = 4
    const N = 2 * L + 1
    fakePrediko(c, N)
    const { served, hasMore } = await walk(c, L)
    expect(served).toEqual(ids(c, 1, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 is rows L+1..2L, not a repeat of page 1', async () => {
    fakePrediko(c, 9)
    expect(await call(c, withPageSink({ page: 2, limit: 4 }))).toEqual(ids(c, 5, 4))
  })

  it(`every page sends the same bare GET ${c.path}: the platform documents no paging parameter`, async () => {
    const { seen } = fakePrediko(c, 9)
    await walk(c, 4)
    expect(seen).toHaveLength(3)
    for (const s of seen) {
      expect(s.path).toBe(c.path)
      expect(s.params ?? {}).toEqual({})
    }
  })

  it('reports the whole collection as totalCount and marks the page as paged locally', async () => {
    fakePrediko(c, 9)
    const params = withPageSink({ page: 1, limit: 4 })
    await call(c, params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
  })

  it('N = 2L: page 2 ends the collection and page 3 is empty', async () => {
    const L = 4
    fakePrediko(c, 2 * L)
    const { served, hasMore } = await walk(c, L)
    expect(served).toEqual(ids(c, 1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('an empty collection is one empty last page', async () => {
    fakePrediko(c, 0)
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call(c, params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual({ totalCount: 0, hasMore: false, pagedLocally: true })
  })

  it('a response without `data` is an empty collection, not an error', async () => {
    fakePrediko(c, 0, { body: { total: 0 } })
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call(c, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('walks every row at the worker limit of 500 (no declared max), 500 rows to a full page', async () => {
    fakePrediko(c, 1200)
    const { served, sizes, hasMore } = await walk(c, 500)
    expect(served).toEqual(ids(c, 1, 1200))
    // A full page is exactly the size asked for: pagedLocally claims the
    // caller's page size, and reports no pageSize that would say otherwise.
    expect(sizes).toEqual([500, 500, 200])
    expect(hasMore).toEqual([true, true, false])
  })

  it('a limit above the router cap (500) is clamped, and every row is still served once', async () => {
    // These endpoints document no page size at all, so the only clamp is parseListQuery's.
    fakePrediko(c, 1001)
    const served: string[] = []
    const sizes: number[] = []
    const hasMore: Array<boolean | null> = []
    for (let page = 1; page <= 3; page++) {
      const params = routerParams({ page: String(page), limit: '100000' })
      expect(params.limit).toBe(500)
      const rows = await list(c, params)
      sizes.push(rows.length)
      const env = listPage(rows, params, 'prediko')
      expect(env.meta.limit).toBe(500)
      served.push(...env.data.map((r) => r.id))
      hasMore.push(env.meta.hasMore)
    }
    expect(served).toEqual(ids(c, 1, 1001))
    expect(sizes).toEqual([500, 500, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('a call naming no limit asked for everything, and gets every row as the last page', async () => {
    fakePrediko(c, 150)
    const params = withPageSink({})
    expect(await call(c, params)).toEqual(ids(c, 1, 150))
    expect(readUpstreamPage(params)).toEqual({
      totalCount: 150,
      hasMore: false,
      pagedLocally: true,
    })
  })

  it('rows the platform returns out of id order are served in id order', async () => {
    fakePrediko(c, 9, { order: (rows) => rows.reverse() })
    const { served, hasMore } = await walk(c, 4)
    expect(served).toEqual(ids(c, 1, 9))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a row that moves between two pages of one walk is neither skipped nor served twice', async () => {
    // The platform documents no order. An unordered read commonly returns an
    // updated row last: here row 1 is updated after page 1 was served.
    fakePrediko(c, 9, {
      order: (rows, n) => (n === 0 ? rows : [...rows.slice(1), rows[0]!]),
    })
    const { served, hasMore } = await walk(c, 4)
    expect(served).toEqual(ids(c, 1, 9))
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    fakePrediko(c, 15)
    const served: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = routerParams({ page: String(page), limit: '7' })
      expect(params.limit).toBe(7)
      served.push(...(await call(c, params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(c, 1, 15))
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage publishes an exact meta.hasMore and totalCount', async () => {
    fakePrediko(c, 9)
    const p1 = routerParams({ page: '1', limit: '4' })
    const env1 = listPage(await list(c, p1), p1, 'prediko')
    expect(env1.data.map((r) => r.id)).toEqual(ids(c, 1, 4))
    expect(env1.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 4, totalCount: 9, hasMore: true }),
    )

    const p3 = routerParams({ page: '3', limit: '4' })
    const env3 = listPage(await list(c, p3), p3, 'prediko')
    expect(env3.data.map((r) => r.id)).toEqual(ids(c, 9, 1))
    expect(env3.meta).toEqual(
      expect.objectContaining({ page: 3, limit: 4, totalCount: 9, hasMore: false }),
    )
  })

  it('API path: an exact multiple of the limit ends with hasMore false, not null', async () => {
    fakePrediko(c, 8)
    const p2 = routerParams({ page: '2', limit: '4' })
    const env2 = listPage(await list(c, p2), p2, 'prediko')
    expect(env2.data.map((r) => r.id)).toEqual(ids(c, 5, 4))
    expect(env2.meta.hasMore).toBe(false)
  })

  it('API path: a request with no page is page 1', async () => {
    fakePrediko(c, 9)
    const params = routerParams({ limit: '4' })
    const env = listPage(await list(c, params), params, 'prediko')
    expect(env.data.map((r) => r.id)).toEqual(ids(c, 1, 4))
    expect(env.meta.hasMore).toBe(true)
  })
})

/**
 * GET /orders documents `updated_after` ("Orders updated after this timestamp
 * (ISO 8601 format, e.g., 2025-01-15T10:30:00Z)") and a `total` of "orders
 * matching the query". Unforwarded, the adapter paged every order and
 * reported the whole collection as the total of a filtered request.
 */
describe('prediko listPurchaseOrders forwards updated_after (GET /orders)', () => {
  const po = CASES.find((c) => c.method === 'listPurchaseOrders')!

  it('sends updatedAfter as the documented updated_after, in whole seconds', async () => {
    const { seen } = fakePrediko(po, 20)
    const updatedAfter = new Date('2026-01-01T10:00:00.789Z')
    await call(po, withPageSink({ page: 1, limit: 4, updatedAfter }))
    expect(seen).toEqual([{ path: '/orders', params: { updated_after: '2026-01-01T10:00:00Z' } }])
  })

  it('pages and counts only the matching orders', async () => {
    // Order i was updated i hours into 2026, so orders 11..20 match.
    fakePrediko(po, 20)
    const updatedAfter = new Date('2026-01-01T10:00:00Z')
    const { served, hasMore } = await walk(po, 4, 3, { updatedAfter })
    expect(served).toEqual(ids(po, 11, 10))
    expect(hasMore).toEqual([true, true, false])

    const p1 = withPageSink({ page: 1, limit: 4, updatedAfter })
    await call(po, p1)
    expect(readUpstreamPage(p1)).toEqual({ totalCount: 10, hasMore: true, pagedLocally: true })
  })

  it('API path: ?updated_after= reaches the platform and meta.totalCount counts the matches', async () => {
    fakePrediko(po, 20)
    const params = routerParams({ page: '1', limit: '4', updated_after: '2026-01-01T10:00:00Z' })
    const env = listPage(await adapter().listPurchaseOrders(CREDS, params), params, 'prediko')
    expect(env.data.map((r) => r.id)).toEqual(ids(po, 11, 4))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 4, totalCount: 10, hasMore: true }),
    )
  })
})
