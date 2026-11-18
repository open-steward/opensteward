/**
 * Apicbase keeps stock levels and transfer events per outlet, so the adapter
 * lists them outlet by outlet, and every one of those lists is paginated:
 *
 *   "Requests to these endpoints can include a `page` query parameter to
 *   request other pages in the paginated result set"; "with 10 results being
 *   shown by page by default"; `page_size` raises that, and "In most cases,
 *   the maximum amount of items that can be requested is **200**."
 *   — https://developers.apicbase.com/reference/pagination
 *
 * GET /accounts/outlets/ (reference/get-outlets) returns outlets carrying
 * `id` (there is no `uid`). GET /inventory/outlets/{outlet_id}/stock_items/stock/
 * (reference/get-inventory-stock-item-details) returns `{ count, next,
 * previous, results }` whose rows carry the stock item's `id`. The incoming
 * and outgoing transfer-event lists (reference/get-incoming-transfer-events,
 * get-outgoing-transfer-events) take `page` and return the same envelope.
 *
 * The adapter used to forward the caller's page to EVERY outlet and
 * concatenate, so a caller page held up to outlets × limit rows and page 2
 * skipped rows; it built each outlet's URL from `uid`, so the unfiltered
 * lists asked for /inventory/outlets/undefined/… and came back empty; and it
 * read only the first 200 outlets. It now walks (outlet, list, page) as one
 * stream and cuts exactly the caller's rows out of it (`pageByRows`).
 *
 * The lists Apicbase serves from one endpoint (ingredients, outlets,
 * suppliers, purchase orders, and one outlet's stock) used to send
 * `page_size` = the caller's limit, 500 at the router's ceiling, which the
 * documented maximum of 200 cuts to 200 rows: the sync worker read 200 of 500
 * as the last page and stored the collection as complete. They now send at
 * most 200 and report that size and the envelope's `next`.
 *
 * Stock adjustments are top counts: GET /inventory/outlets/{outlet_id}/count_events/
 * (reference/get-top-counts), whose `page_size` is "Defaults to 10, capped at
 * 100.", with each count's lines read from GET …/count_events/{top_count_id}/stocks/
 * (reference/get-stock-items-in-a-top-count), a plain array. The adapter used
 * to call the retired `count_events/aggregated/` and concatenate every
 * outlet's page of it.
 *
 * The fake upstream below honours only the documented parameters (`page`,
 * `page_size` up to 200, or 100 for top counts) and answers a page past the end the way Django REST
 * Framework does (404 "Invalid page."), so any paging it appears to do is the
 * adapter's. It serves each bearer token its own account.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { ApicbaseAdapter } from '../../../../../../src/verticals/inventory/adapters/apicbase'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'

const TOKEN = 'apicbase-access-token'
const CREDS: Credentials = { accessToken: TOKEN, extra: {} }
const BASE = 'https://api.apicbase.com/api/v2'
/** Documented default page size. */
const DEFAULT_SIZE = 10
/** Documented maximum page size. */
const MAX_SIZE = 200
/** GET …/count_events/: "The number of results per page. Defaults to 10, capped at 100." */
const COUNT_MAX_SIZE = 100
/** The router's largest limit, and the page size the sync worker asks for. */
const ROUTER_MAX = 500

interface Call {
  token: string
  path: string
  params: Record<string, unknown>
  status: number
}

interface FakeData {
  outlets: string[]
  /** path → the HTTP status that path answers with instead */
  statusAt?: Record<string, number>
  /** outlet id → stock item ids in that outlet's stock list */
  stock?: Record<string, string[]>
  /** outlet id → transfer event ids in that outlet's incoming list */
  incoming?: Record<string, string[]>
  /** outlet id → transfer event ids in that outlet's outgoing list */
  outgoing?: Record<string, string[]>
  /** outlet id → top count ids in that outlet's GET …/count_events/ */
  counts?: Record<string, string[]>
  /** outlet id → the HTTP status its per-outlet lists answer with instead */
  failing?: Record<string, number>
  /** ids of GET /products/ingredients/ */
  ingredients?: string[]
  /** ids of GET /suppliers/ */
  suppliers?: string[]
  /** ids of GET /procurement/purchase_orders/ */
  purchaseOrders?: string[]
}

function httpError(status: number, path: string): Error {
  return Object.assign(new Error(`Request failed with status code ${status} (${path})`), {
    isAxiosError: true,
    response: { status, data: { detail: status === 404 ? 'Not found.' : 'Forbidden.' } },
  })
}

const outletUrl = (id: string) => `${BASE}/accounts/outlets/${id}/`

/** One DRF page of `rows`, read from the documented parameters only. */
function drfPage<T>(path: string, rows: T[], params: Record<string, unknown>) {
  const page = params['page'] === undefined ? 1 : Number(params['page'])
  const asked = params['page_size'] === undefined ? DEFAULT_SIZE : Number(params['page_size'])
  const size = Math.min(asked, /\/count_events\/$/.test(path) ? COUNT_MAX_SIZE : MAX_SIZE)
  const pages = Math.max(1, Math.ceil(rows.length / size))
  if (!Number.isInteger(page) || page < 1 || page > pages) return undefined
  const link = (p: number) => `${BASE}${path}?page=${p}&page_size=${size}`
  return {
    count: rows.length,
    next: page < pages ? link(page + 1) : null,
    previous: page > 1 ? link(page - 1) : null,
    results: rows.slice((page - 1) * size, page * size),
  }
}

/** The rows `data` holds at `path`, or an HTTP status to answer with instead. */
function rowsAt(data: FakeData, path: string): unknown[] | number {
  const status = data.statusAt?.[path]
  if (status !== undefined) return status
  if (path === '/accounts/outlets/') {
    return data.outlets.map((id) => ({ id, name: `Outlet ${id}`, url: outletUrl(id) }))
  }
  if (path === '/products/ingredients/') {
    return (data.ingredients ?? []).map((id) => ({
      id,
      name: `Ingredient ${id}`,
      main_stock_items: [],
    }))
  }
  if (path === '/suppliers/') {
    return (data.suppliers ?? []).map((id) => ({
      id,
      url: `${BASE}/suppliers/${id}/`,
      company_name: `Supplier ${id}`,
    }))
  }
  if (path === '/procurement/purchase_orders/') {
    return (data.purchaseOrders ?? []).map((id) => ({
      id,
      order_number: `PO-${id}`,
      status: 'ORDERED',
      packages: [],
    }))
  }
  const m =
    /^\/inventory\/outlets\/([^/]+)\/(stock_items\/stock|transfer_events\/(incoming|outgoing)|count_events)\/$/.exec(
      path,
    )
  const outlet = m?.[1]
  if (!m || outlet === undefined || !data.outlets.includes(outlet)) return 404
  const failing = data.failing?.[outlet]
  if (failing !== undefined) return failing
  if (m[2] === 'count_events') {
    // The closed "Count #4" of reference/get-top-counts, one per id.
    return (data.counts?.[outlet] ?? []).map((id) => ({
      id,
      name: `Count ${id}`,
      status: 'Closed',
      full_count: true,
      created: '2020-06-17T14:01:55Z',
      actual_date: '2020-06-17T14:01:55Z',
      finished: '2020-06-17T14:02:39Z',
      created_by: null,
      owned_by: null,
      finished_by: null,
      stock_value: '-6.00',
      remarks: 'Weekly stock take',
      stock_period: null,
    }))
  }
  if (m[2] === 'stock_items/stock') {
    return (data.stock?.[outlet] ?? []).map((id) => ({
      id,
      name: `Stock item ${id}`,
      package_description: { unit: 'g', quantity: '700.000000' },
      par: null,
      minimum_quantity_required: null,
      quantity: 5,
      stock_value: 0.27,
    }))
  }
  if (m[3] === 'incoming') {
    return (data.incoming?.[outlet] ?? []).map((id) => ({
      id,
      name: `Transfer ${id}`,
      status: 'Closed',
      created: '2021-03-24T02:15:34Z',
      finished: '2021-03-24T02:15:46Z',
      actual_date: null,
      remarks: '',
      stock_value: '50.00',
      items: [],
      origin_outlet: outletUrl('elsewhere'),
    }))
  }
  return (data.outgoing?.[outlet] ?? []).map((id) => ({
    id,
    name: `Transfer ${id}`,
    in_progress: false,
    created: '2021-03-24T02:17:17Z',
    finished: '2021-03-24T02:17:31Z',
    actual_date: null,
    remarks: '',
    stock_value: '-75.00',
    items: [],
    destination_outlet: outletUrl('elsewhere'),
  }))
}

/** Fake Apicbase accounts, one per bearer token, recording every request. */
function fakeAccounts(accounts: Record<string, FakeData>): Call[] {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((config?: {
    headers?: Record<string, unknown>
  }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const data = accounts[token]
    if (!data) throw new Error(`no fake account for token "${token}"`)
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = cfg?.params ?? {}
      const answer = (status: number, body?: unknown) => {
        calls.push({ token, path, params, status })
        if (status !== 200) throw httpError(status, path)
        return { data: body }
      }
      const stocks = /^\/inventory\/outlets\/([^/]+)\/count_events\/([^/]+)\/stocks\/$/.exec(path)
      if (stocks) {
        // reference/get-stock-items-in-a-top-count: a plain array, no paging parameters.
        const [, outlet, count] = stocks
        if (!outlet || !count || !data.counts?.[outlet]?.includes(count)) return answer(404)
        if (Object.keys(params).length > 0) throw new Error(`undocumented params on ${path}`)
        return answer(200, [
          {
            stock_item: { id: `item-${count}`, name: 'Apples Package (10 kg)', url: '' },
            quantity: '1.0000000000',
            inventory_log_entries: [
              {
                theoretical_quantity: '0.0000000000',
                quantity: '1.0000000000',
                variance_quantity: '1.0000000000',
              },
            ],
          },
        ])
      }
      const rows = rowsAt(data, path)
      if (typeof rows === 'number') return answer(rows)
      const body = drfPage(path, rows, params)
      // Django REST Framework answers a page past the end with 404 "Invalid page."
      return body === undefined ? answer(404) : answer(200, body)
    })
    return { get }
  }) as never)
  return calls
}

/** A fake Apicbase account holding `data`, for CREDS. */
const fakeApicbase = (data: FakeData): Call[] => fakeAccounts({ [TOKEN]: data })

const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

/** Stock-level ids as the adapter emits them: `{stockItemId}:{outletId}`. */
const stockIds = (outlet: string, items: string[]) => items.map((id) => `${id}:${outlet}`)

/** The router's parse, with the adapter typed as the router holds it. */
function parse(query: Record<string, string>): QueryParams {
  const routed: InventoryAdapter = new ApicbaseAdapter()
  return parseListQuery(query, routed)
}

type Row = { id: string; raw?: unknown }
type Lister = (params: QueryParams, creds?: Credentials) => Promise<Row[]>

const stockLevels: Lister = (params, creds = CREDS) =>
  new ApicbaseAdapter().listStockLevels(creds, params)
const transfers: Lister = (params, creds = CREDS) =>
  new ApicbaseAdapter().listStockTransfers(creds, params)
const products: Lister = (params) => new ApicbaseAdapter().listProducts(CREDS, params)
const locations: Lister = (params) => new ApicbaseAdapter().listLocations(CREDS, params)
const suppliers: Lister = (params) => new ApicbaseAdapter().listSuppliers(CREDS, params)
const purchaseOrders: Lister = (params) => new ApicbaseAdapter().listPurchaseOrders(CREDS, params)

/** The id Apicbase gave a row: what the paging tests follow, whatever the transform makes of it. */
const upstreamId = (r: Row) => (r.raw as { id: string }).id

/** Page through a list the way the sync worker does. */
async function drive(
  list: Lister,
  limit: number,
  pages: number,
  extra: QueryParams = {},
  idOf: (r: Row) => string = (r) => r.id,
) {
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const pagedLocally: Array<boolean | undefined> = []
  const pageSizes: Array<number | undefined> = []
  const totals: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit, ...extra })
    const rows = await list(params)
    expect(rows.length).toBeLessThanOrEqual(limit)
    seen.push(...rows.map(idOf))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    pagedLocally.push(meta?.pagedLocally)
    pageSizes.push(meta?.pageSize)
    totals.push(meta?.totalCount)
  }
  return { seen, hasMore, pagedLocally, pageSizes, totals }
}

/** Page through a list the way the API does: parseListQuery, then listPage. */
async function viaApi(
  list: Lister,
  limit: number,
  pages: number,
  idOf: (r: Row) => string = (r) => r.id,
) {
  const out: Array<{ ids: string[]; hasMore: boolean | null; limit: number }> = []
  for (let page = 1; page <= pages; page++) {
    const params = parse({ limit: String(limit), page: String(page) })
    const env = listPage(await list(params), params, 'apicbase')
    out.push({ ids: env.data.map(idOf), hasMore: env.meta.hasMore, limit: env.meta.limit })
  }
  return out
}

const requestsTo = (calls: Call[], path: string) => calls.filter((c) => c.path === path)

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('ApicbaseAdapter.listStockLevels across every outlet', () => {
  it('serves 2L + 1 stock levels once each over three pages, ending on the third', async () => {
    const L = 3
    const stock = { A: range('a', 4), B: [], C: range('c', 3) }
    const calls = fakeApicbase({ outlets: ['A', 'B', 'C'], stock })
    const { seen, hasMore, pagedLocally } = await drive(stockLevels, L, 3)
    expect(seen).toEqual([...stockIds('A', stock.A), ...stockIds('C', stock.C)])
    expect(hasMore).toEqual([true, true, false])
    expect(pagedLocally).toEqual([true, true, true])
    // Outlets are listed by their documented `id`, at the documented maximum.
    expect(requestsTo(calls, '/accounts/outlets/')[0]?.params).toEqual({
      page: 1,
      page_size: MAX_SIZE,
    })
    // Each outlet's list is paged by its own documented `page`, at the caller's size.
    expect(
      requestsTo(calls, '/inventory/outlets/A/stock_items/stock/').map((c) => c.params),
    ).toContainEqual({
      page: 2,
      page_size: L,
    })
    expect(calls.every((c) => c.status === 200)).toBe(true)
  })

  it('ends on page 2 when the outlets hold exactly 2L rows', async () => {
    const L = 2
    const stock = { A: range('a', 2), B: range('b', 2) }
    fakeApicbase({ outlets: ['A', 'B'], stock })
    const { seen, hasMore } = await drive(stockLevels, L, 3)
    expect(seen).toEqual([...stockIds('A', stock.A), ...stockIds('B', stock.B)])
    expect(hasMore).toEqual([true, false, false])
  })

  it('follows the outlet list past its first page of 200', async () => {
    const outlets = range('o', MAX_SIZE + 1)
    const stock = { o0: ['x0'], o200: ['y0', 'y1'] }
    const calls = fakeApicbase({ outlets, stock })
    const { seen, hasMore } = await drive(stockLevels, 2, 2)
    expect(seen).toEqual(['x0:o0', 'y0:o200', 'y1:o200'])
    expect(hasMore).toEqual([true, false])
    expect(requestsTo(calls, '/accounts/outlets/').map((c) => c.params)).toContainEqual({
      page: 2,
      page_size: MAX_SIZE,
    })
  })

  it('reads on past a page of outlets that holds none with an id', async () => {
    fakeApicbase({ outlets: [...Array<string>(MAX_SIZE).fill(''), 'A'], stock: { A: ['a0'] } })
    const { seen, hasMore } = await drive(stockLevels, 5, 1)
    expect(seen).toEqual(['a0:A'])
    expect(hasMore).toEqual([false])
  })

  it('clamps a limit above 200 to 200 upstream and still serves every row once', async () => {
    const L = 250
    const stock = { A: range('a', 2 * L + 1) }
    const calls = fakeApicbase({ outlets: ['A'], stock })
    const { seen, hasMore } = await drive(stockLevels, L, 3)
    expect(seen).toEqual(stockIds('A', stock.A))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.every((c) => Number(c.params['page_size']) <= MAX_SIZE)).toBe(true)
  })

  it('pages at the limit parseListQuery delivers', async () => {
    const stock = { A: range('a', 3), B: range('b', 2) }
    fakeApicbase({ outlets: ['A', 'B'], stock })
    const seen: string[] = []
    for (const page of ['1', '2', '3']) {
      const params = parse({ limit: '2', page })
      expect(params.limit).toBe(2)
      seen.push(...(await stockLevels(params)).map((r) => r.id))
    }
    expect(seen).toEqual([...stockIds('A', stock.A), ...stockIds('B', stock.B)])
  })

  it('reports an exact hasMore on the API path', async () => {
    const stock = { A: range('a', 4), B: range('b', 3) }
    fakeApicbase({ outlets: ['A', 'B'], stock })
    expect((await viaApi(stockLevels, 3, 3)).map(({ ids, hasMore }) => ({ ids, hasMore }))).toEqual(
      [
        { ids: ['a0:A', 'a1:A', 'a2:A'], hasMore: true },
        { ids: ['a3:A', 'b0:B', 'b1:B'], hasMore: true },
        { ids: ['b2:B'], hasMore: false },
      ],
    )
  })

  it('skips an outlet whose stock the token may not read, and fails on any other error', async () => {
    fakeApicbase({
      outlets: ['A', 'B', 'C'],
      stock: { A: ['a0'], B: ['b0'], C: ['c0'] },
      failing: { B: 403 },
    })
    const { seen, hasMore } = await drive(stockLevels, 5, 1)
    expect(seen).toEqual(['a0:A', 'c0:C'])
    expect(hasMore).toEqual([false])

    _resetCursorPager()
    vi.restoreAllMocks()
    fakeApicbase({ outlets: ['A', 'B'], stock: { A: ['a0'], B: ['b0'] }, failing: { B: 401 } })
    await expect(stockLevels(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/401/)
  })

  it('skips an outlet deleted since it was listed (404)', async () => {
    fakeApicbase({
      outlets: ['A', 'B', 'C'],
      stock: { A: ['a0'], B: ['b0'], C: ['c0'] },
      failing: { B: 404 },
    })
    const { seen, hasMore } = await drive(stockLevels, 5, 1)
    expect(seen).toEqual(['a0:A', 'c0:C'])
    expect(hasMore).toEqual([false])
  })

  it('fails when a token may read no outlet at all, rather than serving a complete empty list', async () => {
    // Assumed, not documented: a token with the `accounts` scope and not
    // `inventory` lists outlets, and every outlet's stock refuses it.
    fakeApicbase({
      outlets: ['A', 'B'],
      stock: { A: ['a0'], B: ['b0'] },
      failing: { A: 403, B: 403 },
    })
    await expect(stockLevels(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/403/)
  })

  it('remembers across a page of outlets whether any outlet answered, or all refused', async () => {
    // 200 outlets answer, and the 201st, on the next page of outlets, refuses.
    const outlets = range('o', MAX_SIZE + 1)
    fakeApicbase({ outlets, stock: { o0: ['x0'] }, failing: { o200: 403 } })
    expect(await drive(stockLevels, 5, 1)).toMatchObject({ seen: ['x0:o0'], hasMore: [false] })

    // 200 outlets refuse, and the 201st, on the next page of outlets, is gone.
    _resetCursorPager()
    vi.restoreAllMocks()
    const failing = Object.fromEntries(outlets.map((o) => [o, 403]))
    fakeApicbase({ outlets, failing: { ...failing, o200: 404 } })
    await expect(stockLevels(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/403/)

    // 200 outlets refuse, and the next page of outlets has none with an id to read.
    _resetCursorPager()
    vi.restoreAllMocks()
    fakeApicbase({ outlets: [...range('o', MAX_SIZE), ''], failing })
    await expect(stockLevels(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/403/)
  })

  it('serves an empty list when one outlet refuses and the rest answer empty', async () => {
    fakeApicbase({ outlets: ['A', 'B'], stock: {}, failing: { A: 403 } })
    const { seen, hasMore } = await drive(stockLevels, 5, 1)
    expect(seen).toEqual([])
    expect(hasMore).toEqual([false])
  })

  it('fails when the outlets cannot be listed, rather than reading as empty', async () => {
    fakeApicbase({ outlets: ['A'], stock: { A: ['a0'] }, statusAt: { '/accounts/outlets/': 401 } })
    await expect(stockLevels(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/401/)
  })

  it('makes no per-outlet request for an account with no outlets', async () => {
    const calls = fakeApicbase({ outlets: [] })
    const params = withPageSink({ page: 1, limit: 5 })
    expect(await stockLevels(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.map((c) => c.path)).toEqual(['/accounts/outlets/'])
  })

  it('never serves one connection the rows another connection walked', async () => {
    fakeAccounts({
      ta: { outlets: ['A1'], stock: { A1: range('a', 4) } },
      tb: { outlets: ['B1'], stock: { B1: range('b', 4) } },
    })
    const a = { accessToken: 'ta', extra: {} }
    const b = { accessToken: 'tb', extra: {} }
    expect((await stockLevels(withPageSink({ page: 1, limit: 2 }), a)).map((r) => r.id)).toEqual([
      'a0:A1',
      'a1:A1',
    ])
    expect((await stockLevels(withPageSink({ page: 2, limit: 2 }), b)).map((r) => r.id)).toEqual([
      'b2:B1',
      'b3:B1',
    ])
  })

  it('does not replay a walk made at another page size', async () => {
    const calls = fakeApicbase({ outlets: ['A'], stock: { A: range('r', 6) } })
    await drive(stockLevels, 3, 2)
    const params = withPageSink({ page: 3, limit: 2 })
    expect((await stockLevels(params)).map((r) => r.id)).toEqual(['r4:A', 'r5:A'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requestsTo(calls, '/inventory/outlets/A/stock_items/stock/').at(-1)?.params).toEqual({
      page: 3,
      page_size: 2,
    })
  })
})

describe('ApicbaseAdapter.listStockLevels for one outlet (filter.outletId)', () => {
  const one = { filter: { outletId: 'A' } }

  it('forwards the documented page and page_size and reports the end and the count', async () => {
    const L = 3
    const stock = { A: range('a', 2 * L + 1) }
    const calls = fakeApicbase({ outlets: ['A', 'B'], stock })
    const { seen, hasMore, totals } = await drive(stockLevels, L, 3, one)
    expect(seen).toEqual(stockIds('A', stock.A))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
    expect(calls.map((c) => [c.path, c.params])).toEqual([
      ['/inventory/outlets/A/stock_items/stock/', { page: 1, page_size: L }],
      ['/inventory/outlets/A/stock_items/stock/', { page: 2, page_size: L }],
      ['/inventory/outlets/A/stock_items/stock/', { page: 3, page_size: L }],
    ])
  })

  it('ends on page 2 at exactly 2L rows', async () => {
    const L = 3
    fakeApicbase({ outlets: ['A'], stock: { A: range('a', 2 * L) } })
    const { seen, hasMore } = await drive(stockLevels, L, 2, one)
    expect(seen).toEqual(stockIds('A', range('a', 2 * L)))
    expect(hasMore).toEqual([true, false])
  })

  it('answers a page past the end with an empty last page, not an error', async () => {
    fakeApicbase({ outlets: ['A'], stock: { A: ['a0'] } })
    const { seen, hasMore } = await drive(stockLevels, 10, 2, one)
    expect(seen).toEqual(['a0:A'])
    expect(hasMore).toEqual([false, false])
  })

  it('fails for an outlet that does not exist, and for one the token may not read', async () => {
    fakeApicbase({ outlets: ['B'], stock: { B: ['b0'] } })
    await expect(stockLevels(withPageSink({ page: 1, limit: 2, ...one }))).rejects.toThrow(/404/)

    vi.restoreAllMocks()
    fakeApicbase({ outlets: ['A'], stock: { A: ['a0'] }, failing: { A: 403 } })
    await expect(stockLevels(withPageSink({ page: 1, limit: 2, ...one }))).rejects.toThrow(/403/)
  })

  it('clamps a limit above 200 to 200, reports that size, and serves every row', async () => {
    const L = 250
    const stock = { A: range('a', 2 * L + 1) }
    const calls = fakeApicbase({ outlets: ['A'], stock })
    const { seen, hasMore, pageSizes } = await drive(stockLevels, L, 3, one)
    expect(seen).toEqual(stockIds('A', stock.A))
    expect(hasMore).toEqual([true, true, false])
    expect(pageSizes).toEqual([MAX_SIZE, MAX_SIZE, MAX_SIZE])
    expect(calls.map((c) => c.params)).toEqual(
      [1, 2, 3].map((page) => ({ page, page_size: MAX_SIZE })),
    )
  })
})

describe('ApicbaseAdapter.listStockTransfers', () => {
  it('serves 2L + 1 transfers once each across outlets and directions', async () => {
    const L = 3
    const data = {
      outlets: ['A', 'B', 'C'],
      incoming: { A: range('ai', 4) },
      outgoing: { A: ['ao0'], C: range('co', 2) },
    }
    const calls = fakeApicbase(data)
    const { seen, hasMore, pagedLocally } = await drive(transfers, L, 3)
    expect(seen).toEqual([...data.incoming.A, ...data.outgoing.A, ...data.outgoing.C])
    expect(hasMore).toEqual([true, true, false])
    expect(pagedLocally).toEqual([true, true, true])
    expect(
      requestsTo(calls, '/inventory/outlets/A/transfer_events/incoming/').map((c) => c.params),
    ).toContainEqual({ page: 2, page_size: L })
    expect(calls.every((c) => c.status === 200)).toBe(true)
  })

  it('ends on page 2 at exactly 2L transfers', async () => {
    const L = 2
    fakeApicbase({
      outlets: ['A', 'B'],
      incoming: { B: ['b0'] },
      outgoing: { A: ['a0', 'a1'], B: ['b1'] },
    })
    const { seen, hasMore } = await drive(transfers, L, 3)
    expect(seen).toEqual(['a0', 'a1', 'b0', 'b1'])
    expect(hasMore).toEqual([true, false, false])
  })

  it('serves a transfer listed at both of its outlets once, wherever the pages fall', async () => {
    // t1 leaves A and arrives at B. At L = 1 its second sighting is the whole
    // of an upstream page, fetched by a later call than the first sighting.
    fakeApicbase({
      outlets: ['A', 'B'],
      outgoing: { A: ['t1'] },
      incoming: { B: ['t2', 't1', 't3'] },
    })
    const { seen, hasMore } = await drive(transfers, 1, 4)
    expect(seen).toEqual(['t1', 't2', 't3'])
    expect(hasMore).toEqual([true, true, false, false])

    // A walk that starts afresh at page 3 cuts the same page.
    _resetCursorPager()
    const params = withPageSink({ page: 3, limit: 1 })
    expect((await transfers(params)).map((r) => r.id)).toEqual(['t3'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves a transfer received at one outlet and sent by a later one once', async () => {
    // A's incoming list comes before its outgoing one, so the ids seen there
    // must outlive the change of direction and the change of outlet.
    fakeApicbase({ outlets: ['A', 'B'], incoming: { A: ['t1'] }, outgoing: { B: ['t1', 't2'] } })
    const { seen, hasMore } = await drive(transfers, 1, 3)
    expect(seen).toEqual(['t1', 't2'])
    expect(hasMore).toEqual([true, false, false])
  })

  it('serves a transfer seen on both sides of a page of outlets once', async () => {
    const outlets = range('o', MAX_SIZE + 1)
    fakeApicbase({ outlets, outgoing: { o0: ['t1'] }, incoming: { o200: ['t1', 't2'] } })
    const { seen } = await drive(transfers, 1, 3)
    expect(seen).toEqual(['t1', 't2'])
  })

  it('serves an id repeated inside one upstream page once, and drops rows with no id', async () => {
    fakeApicbase({ outlets: ['A'], incoming: { A: ['t1', 't1', '', 't2'] } })
    const { seen, hasMore } = await drive(transfers, 5, 1)
    expect(seen).toEqual(['t1', 't2'])
    expect(hasMore).toEqual([false])
  })

  it('names both outlets of each transfer', async () => {
    fakeApicbase({ outlets: ['A', 'B'], outgoing: { A: ['t1'] }, incoming: { B: ['t2'] } })
    const rows = await new ApicbaseAdapter().listStockTransfers(
      CREDS,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(rows.map((r) => [r.id, r.fromLocationId, r.toLocationId, r.status])).toEqual([
      ['t1', 'A', 'elsewhere', 'completed'],
      ['t2', 'elsewhere', 'B', 'completed'],
    ])
  })

  it('pages one outlet, both directions, as one list (filter.outletId)', async () => {
    const L = 3
    const data = {
      outlets: ['A', 'B'],
      incoming: { A: range('ai', 4), B: ['bi0'] },
      outgoing: { A: range('ao', 3) },
    }
    const calls = fakeApicbase(data)
    const { seen, hasMore } = await drive(transfers, L, 3, { filter: { outletId: 'A' } })
    expect(seen).toEqual([...data.incoming.A, ...data.outgoing.A])
    expect(hasMore).toEqual([true, true, false])
    expect(requestsTo(calls, '/accounts/outlets/')).toEqual([])
    expect(calls.every((c) => c.path.startsWith('/inventory/outlets/A/'))).toBe(true)
  })

  it('does not serve a filtered walk from the unfiltered one', async () => {
    fakeApicbase({ outlets: ['A', 'B'], incoming: { A: ['a0', 'a1'], B: range('b', 4) } })
    await drive(transfers, 2, 1)
    const { seen } = await drive(transfers, 2, 2, { filter: { outletId: 'B' } })
    expect(seen).toEqual(['b0', 'b1', 'b2', 'b3'])
    _resetCursorPager()
    // And the other way about: page 2 of B alone, after page 1 of every outlet.
    await drive(transfers, 2, 1)
    const params = withPageSink({ page: 2, limit: 2, filter: { outletId: 'B' } })
    expect((await transfers(params)).map((r) => r.id)).toEqual(['b2', 'b3'])
  })

  it('does not serve transfers from a stock walk', async () => {
    fakeApicbase({ outlets: ['A'], stock: { A: range('s', 4) }, incoming: { A: range('t', 4) } })
    await drive(stockLevels, 2, 1)
    const params = withPageSink({ page: 2, limit: 2 })
    expect((await transfers(params)).map((r) => r.id)).toEqual(['t2', 't3'])
  })

  it('fails when the outlets cannot be listed, rather than reading as empty', async () => {
    fakeApicbase({
      outlets: ['A'],
      incoming: { A: ['t0'] },
      statusAt: { '/accounts/outlets/': 401 },
    })
    await expect(transfers(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/401/)
  })

  it('fails when every outlet refuses both directions, and when the one filtered outlet does', async () => {
    fakeApicbase({ outlets: ['A', 'B'], incoming: { A: ['t0'] }, failing: { A: 403, B: 403 } })
    await expect(transfers(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/403/)
    _resetCursorPager()
    await expect(
      transfers(withPageSink({ page: 1, limit: 5, filter: { outletId: 'A' } })),
    ).rejects.toThrow(/403/)
  })

  it('walks more outlets than the default upstream-page budget allows', async () => {
    // Every outlet's two lists cost a page each even when empty: 501 outlets
    // are 1,002 list pages before the one transfer at the last outlet.
    const outlets = range('o', 501)
    fakeApicbase({ outlets, outgoing: { o500: ['t9'] } })
    const { seen, hasMore } = await drive(transfers, 10, 1)
    expect(seen).toEqual(['t9'])
    expect(hasMore).toEqual([false])
  })

  it('clamps a limit above 200 to 200 upstream and still serves every transfer once', async () => {
    const L = 250
    const data = { outlets: ['A'], outgoing: { A: range('t', 2 * L + 1) } }
    const calls = fakeApicbase(data)
    const { seen, hasMore } = await drive(transfers, L, 3)
    expect(seen).toEqual(data.outgoing.A)
    expect(hasMore).toEqual([true, true, false])
    expect(calls.every((c) => Number(c.params['page_size']) <= MAX_SIZE)).toBe(true)
  })

  it('reports an exact hasMore on the API path', async () => {
    fakeApicbase({
      outlets: ['A', 'B'],
      incoming: { A: ['t0', 't1'] },
      outgoing: { B: ['t2', 't3', 't4'] },
    })
    expect((await viaApi(transfers, 2, 3)).map(({ ids, hasMore }) => ({ ids, hasMore }))).toEqual([
      { ids: ['t0', 't1'], hasMore: true },
      { ids: ['t2', 't3'], hasMore: true },
      { ids: ['t4'], hasMore: false },
    ])
  })

  it('pages at the limit parseListQuery delivers', async () => {
    fakeApicbase({ outlets: ['A'], incoming: { A: ['t0', 't1', 't2'] } })
    const seen: string[] = []
    for (const page of ['1', '2']) {
      const params = parse({ limit: '2', page })
      expect(params.limit).toBe(2)
      seen.push(...(await transfers(params)).map((r) => r.id))
    }
    expect(seen).toEqual(['t0', 't1', 't2'])
  })
})

/**
 * The lists Apicbase serves from one endpoint, as each is read: its path, the
 * fake's field, and the id each row is followed by (products and suppliers are
 * followed by the upstream id their row carried).
 */
const ONE_ENDPOINT: Array<{
  name: string
  list: Lister
  path: string
  data: (ids: string[]) => FakeData
  idOf: (r: Row) => string
}> = [
  {
    name: 'listProducts',
    list: products,
    path: '/products/ingredients/',
    data: (ids) => ({ outlets: [], ingredients: ids }),
    idOf: upstreamId,
  },
  {
    name: 'listLocations',
    list: locations,
    path: '/accounts/outlets/',
    data: (ids) => ({ outlets: ids }),
    idOf: (r) => r.id,
  },
  {
    name: 'listSuppliers',
    list: suppliers,
    path: '/suppliers/',
    data: (ids) => ({ outlets: [], suppliers: ids }),
    idOf: upstreamId,
  },
  {
    name: 'listPurchaseOrders',
    list: purchaseOrders,
    path: '/procurement/purchase_orders/',
    data: (ids) => ({ outlets: [], purchaseOrders: ids }),
    idOf: (r) => r.id,
  },
]

describe.each(ONE_ENDPOINT)('ApicbaseAdapter.$name', ({ list, path, data, idOf }) => {
  it('forwards the documented page and page_size and reports the end and the count', async () => {
    const L = 3
    const ids = range('r', 2 * L + 1)
    const calls = fakeApicbase(data(ids))
    const { seen, hasMore, totals, pageSizes } = await drive(list, L, 3, {}, idOf)
    expect(seen).toEqual(ids)
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([ids.length, ids.length, ids.length])
    expect(pageSizes).toEqual([undefined, undefined, undefined])
    expect(calls.map((c) => [c.path, c.params])).toEqual(
      [1, 2, 3].map((page) => [path, { page, page_size: L }]),
    )
  })

  it("serves every row once at the sync worker's page size, 200 at a time", async () => {
    // Asked for 500, Apicbase serves at most 200: without the report, the
    // worker read the first 200 as the last page.
    const ids = range('r', 450)
    const calls = fakeApicbase(data(ids))
    const { seen, hasMore, pageSizes } = await drive(list, ROUTER_MAX, 3, {}, idOf)
    expect(seen).toEqual(ids)
    expect(hasMore).toEqual([true, true, false])
    expect(pageSizes).toEqual([MAX_SIZE, MAX_SIZE, MAX_SIZE])
    expect(calls.map((c) => c.params)).toEqual(
      [1, 2, 3].map((page) => ({ page, page_size: MAX_SIZE })),
    )
  })

  it("reports a full page of 200 as full on the API path at the router's largest limit", async () => {
    fakeApicbase(data(range('r', 250)))
    expect(
      (await viaApi(list, ROUTER_MAX, 2, idOf)).map(({ ids, hasMore, limit }) => [
        ids.length,
        hasMore,
        limit,
      ]),
    ).toEqual([
      [MAX_SIZE, true, MAX_SIZE],
      [50, false, MAX_SIZE],
    ])
  })

  it('answers a page past the end with an empty last page', async () => {
    fakeApicbase(data(['r0']))
    const { seen, hasMore } = await drive(list, 10, 2, {}, idOf)
    expect(seen).toEqual(['r0'])
    expect(hasMore).toEqual([false, false])
  })

  it('fails on page 1 rather than reading an error as an empty list', async () => {
    fakeApicbase({ ...data(['r0']), statusAt: { [path]: 403 } })
    await expect(list(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/403/)
  })

  it('fails on a later page for any error but the 404 past the end', async () => {
    fakeApicbase({ ...data(range('r', 20)), statusAt: { [path]: 401 } })
    await expect(list(withPageSink({ page: 2, limit: 5 }))).rejects.toThrow(/401/)
  })
})

const adjustments: Lister = (params, creds = CREDS) =>
  new ApicbaseAdapter().listStockAdjustments(creds, params)
const countsPath = (outlet: string) => `/inventory/outlets/${outlet}/count_events/`
const isStocks = (c: Call) => c.path.endsWith('/stocks/')

describe('ApicbaseAdapter.listStockAdjustments', () => {
  it('serves 2L + 1 top counts once each over three pages from the documented path', async () => {
    const L = 3
    const counts = { A: range('a', 4), B: [], C: range('c', 3) }
    const calls = fakeApicbase({ outlets: ['A', 'B', 'C'], counts })
    const { seen, hasMore, pagedLocally } = await drive(adjustments, L, 3)
    expect(seen).toEqual([...counts.A.map((id) => `${id}:A`), ...counts.C.map((id) => `${id}:C`)])
    expect(hasMore).toEqual([true, true, false])
    expect(pagedLocally).toEqual([true, true, true])
    expect(calls.some((c) => c.path.includes('/aggregated/'))).toBe(false)
    expect(requestsTo(calls, countsPath('A')).map((c) => c.params)).toContainEqual({
      page: 2,
      page_size: L,
    })
    expect(calls.every((c) => c.status === 200)).toBe(true)
  })

  it('ends on page 2 at exactly 2L top counts', async () => {
    fakeApicbase({ outlets: ['A', 'B'], counts: { A: ['a0'], B: ['b0', 'b1', 'b2'] } })
    const { seen, hasMore } = await drive(adjustments, 2, 3)
    expect(seen).toEqual(['a0:A', 'b0:B', 'b1:B', 'b2:B'])
    expect(hasMore).toEqual([true, false, false])
  })

  it('reads the lines of exactly the top counts it serves, from …/stocks/', async () => {
    const calls = fakeApicbase({ outlets: ['A'], counts: { A: range('a', 5) } })
    const rows = await new ApicbaseAdapter().listStockAdjustments(
      CREDS,
      withPageSink({ page: 2, limit: 2 }),
    )
    expect(rows.map((r) => [r.id, r.locationId, r.lines])).toEqual([
      [
        'a2:A',
        'A',
        [{ productId: 'item-a2', deltaQuantity: 1, countedQuantity: 1, notes: undefined }],
      ],
      [
        'a3:A',
        'A',
        [{ productId: 'item-a3', deltaQuantity: 1, countedQuantity: 1, notes: undefined }],
      ],
    ])
    expect(calls.filter(isStocks).map((c) => c.path)).toEqual([
      '/inventory/outlets/A/count_events/a2/stocks/',
      '/inventory/outlets/A/count_events/a3/stocks/',
    ])
  })

  it('never asks for more than the documented 100 top counts a page, and serves every one', async () => {
    const L = 150
    const counts = { A: range('a', 2 * L + 1) }
    const calls = fakeApicbase({ outlets: ['A'], counts })
    const { seen, hasMore } = await drive(adjustments, L, 3)
    expect(seen).toEqual(counts.A.map((id) => `${id}:A`))
    expect(hasMore).toEqual([true, true, false])
    const listed = requestsTo(calls, countsPath('A'))
    expect(listed.map((c) => c.params['page_size'])).toContain(COUNT_MAX_SIZE)
    expect(listed.every((c) => Number(c.params['page_size']) <= COUNT_MAX_SIZE)).toBe(true)
  })

  it('pages one outlet (filter.outletId) without listing outlets', async () => {
    const calls = fakeApicbase({ outlets: ['A', 'B'], counts: { A: range('a', 5), B: ['b0'] } })
    const { seen, hasMore } = await drive(adjustments, 2, 3, { filter: { outletId: 'A' } })
    expect(seen).toEqual(range('a', 5).map((id) => `${id}:A`))
    expect(hasMore).toEqual([true, true, false])
    expect(requestsTo(calls, '/accounts/outlets/')).toEqual([])
    expect(calls.every((c) => c.path.startsWith('/inventory/outlets/A/'))).toBe(true)
  })

  it('reports an exact hasMore on the API path', async () => {
    fakeApicbase({ outlets: ['A', 'B'], counts: { A: ['a0', 'a1'], B: ['b0'] } })
    expect((await viaApi(adjustments, 2, 2)).map(({ ids, hasMore }) => ({ ids, hasMore }))).toEqual(
      [
        { ids: ['a0:A', 'a1:A'], hasMore: true },
        { ids: ['b0:B'], hasMore: false },
      ],
    )
  })

  it('fails when the outlets cannot be listed, or every outlet refuses its counts', async () => {
    fakeApicbase({ outlets: ['A'], counts: { A: ['a0'] }, statusAt: { '/accounts/outlets/': 401 } })
    await expect(adjustments(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/401/)
    _resetCursorPager()
    vi.restoreAllMocks()
    fakeApicbase({ outlets: ['A', 'B'], counts: { A: ['a0'] }, failing: { A: 403, B: 403 } })
    await expect(adjustments(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/403/)
  })

  it('skips an outlet that refuses its counts (403) or is gone (404), and serves the rest', async () => {
    // reference/get-top-counts: 403 "User lacks permission to view counts in
    // this outlet.", 404 "Outlet not found."
    for (const status of [403, 404]) {
      _resetCursorPager()
      vi.restoreAllMocks()
      const calls = fakeApicbase({
        outlets: ['A', 'B', 'C'],
        counts: { A: ['a0'], B: ['b0'], C: ['c0'] },
        failing: { B: status },
      })
      const { seen, hasMore } = await drive(adjustments, 5, 1)
      expect(seen).toEqual(['a0:A', 'c0:C'])
      expect(hasMore).toEqual([false])
      expect(calls.filter(isStocks).map((c) => c.path)).toEqual([
        '/inventory/outlets/A/count_events/a0/stocks/',
        '/inventory/outlets/C/count_events/c0/stocks/',
      ])
    }
  })

  it('fails on a top count with no id before asking for its counted items', async () => {
    const calls = fakeApicbase({ outlets: ['A'], counts: { A: [''] } })
    await expect(adjustments(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/has no id/)
    expect(calls.filter(isStocks)).toEqual([])
  })

  it('does not serve top counts from a stock walk', async () => {
    fakeApicbase({ outlets: ['A'], stock: { A: range('s', 4) }, counts: { A: range('t', 4) } })
    await drive(stockLevels, 2, 1)
    const params = withPageSink({ page: 2, limit: 2 })
    expect((await adjustments(params)).map((r) => r.id)).toEqual(['t2:A', 't3:A'])
  })
})

describe('ApicbaseAdapter.getStockAdjustment', () => {
  it('reads back a listed id from the documented detail and its counted items', async () => {
    fakeApicbase({ outlets: ['A'], counts: { A: ['a0'] } })
    const [listed] = await adjustments(withPageSink({ page: 1, limit: 1 }))
    // The detail answers with the listed row (reference/get-top-count-details
    // documents the same fields); what is under test is where it is read.
    vi.restoreAllMocks()
    const got: Call[] = []
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        got.push({ token: TOKEN, path, params: cfg?.params ?? {}, status: 200 })
        if (path.endsWith('/stocks/')) return { data: [] }
        return { data: listed!.raw as object }
      }),
    })) as never)
    const one = await new ApicbaseAdapter().getStockAdjustment(CREDS, listed!.id)
    expect(one.id).toBe(listed!.id)
    expect(got.map((c) => c.path)).toEqual([
      '/inventory/outlets/A/count_events/a0/',
      '/inventory/outlets/A/count_events/a0/stocks/',
    ])
  })

  it('fails rather than serving no lines when …/stocks/ answers anything but the documented array', async () => {
    // reference/get-stock-items-in-a-top-count documents a plain array; a DRF
    // envelope in its place must not read as a count with no lines.
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async (path: string) => {
        if (path.endsWith('/stocks/')) return { data: { count: 0, next: null, results: [] } }
        return { data: { id: 'a0', created: '2020-06-17T14:01:55Z', status: 'Closed' } }
      }),
    })) as never)
    await expect(new ApicbaseAdapter().getStockAdjustment(CREDS, 'a0:A')).rejects.toThrow(
      /not a list/,
    )
  })

  it('refuses an id that does not name both the count and the outlet, before any request', async () => {
    const calls = fakeApicbase({ outlets: ['A'] })
    for (const id of ['a0', ':A', 'a0:']) {
      await expect(new ApicbaseAdapter().getStockAdjustment(CREDS, id)).rejects.toThrow(/must be/)
    }
    expect(calls).toEqual([])
  })
})
