/**
 * GoFrugal (WebReporter API) paging: listProducts, listStockLevels and
 * listLocations over GET /api/v1/items, and the get* lookups that walk it.
 *
 * GoFrugal's ServeEasy KB article for the same GET WebReporter/api/v1/items
 * (https://community.gofrugal.com/portal/en/kb/gofrugalserveeasy/integrations/e-commerce-integration/articles/api-for-list-all-items)
 * shows a paged response envelope next to `items`:
 *
 *     "count": 2, "total_records": 2, "current_page": 1, "per_page": 50, "total_pages": 1
 *
 * The request parameter names are documented on the sibling salesOrders
 * article of the same API
 * (.../e-commerce-integration/articles/api-for-list-all-sales-orders):
 * "WebReporter/api/v1/salesOrders?page=2&limit=50" fetches records 51-100.
 * No maximum is documented for /items (the only one on this API is the
 * salesOrders "A maximum of 250 sales orders alone can be retrieved at one
 * time."), so the adapter declares no maxPageSize.
 *
 * The RetailEasy copy of the items article
 * (.../gofrugalretaileasy/ecommerce-integration/api-integration/articles/list-all-items),
 * the one the adapter's docs_url names, says "Purpose: Used to list all the
 * items", lists no parameters, and shows a bare `{ items }` with no envelope.
 * So the fake below also plays a server that answers every page with the
 * whole master, and the other ways a server can fail to serve the page asked
 * for: ignoring `limit`, ignoring `page`, clamping without an envelope, and
 * reporting a per_page it did not serve.
 *
 * Before the fix every method sent one bare GET /items: at most the server's
 * first page (per_page 50) was reachable, and every caller page repeated it.
 * listProducts and listStockLevels (one stock level per item row) now forward
 * page and limit and report the envelope, and cut the caller's page locally
 * from the whole master when the server did not serve the page asked for.
 * listLocations, which dedupes locationIds across every item row, walks every
 * /items page and slices the distinct locations locally; the get* lookups
 * walk it until they find their row.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  declaredPageMax,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { GofrugalAdapter } from '../../../../../../src/verticals/inventory/adapters/gofrugal/index'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'

const CREDS = {
  accessToken: 'gf-key',
  extra: { apiKey: 'gf-key', baseUrl: 'http://10.0.0.5:8482/WebReporter' },
}

/** The per_page GoFrugal's sample answers with when no limit is sent. */
const SERVER_DEFAULT_PER_PAGE = 50

/**
 * The walk's page size, written out rather than imported: 250 is the only
 * maximum the WebReporter API documents ("A maximum of 250 sales orders alone
 * can be retrieved at one time.").
 */
const WALK = 250

interface ItemRow {
  itemId: number
  itemName: string
  locationId: number
  stock: { stock: number; salePrice: number; mrp: number; itemReferenceCode: string }[]
}

function row(itemId: number, locationId = 1): ItemRow {
  return {
    itemId,
    itemName: `ITEM ${itemId}`,
    locationId,
    stock: [{ stock: itemId, salePrice: 10, mrp: 12, itemReferenceCode: String(itemId) }],
  }
}

/** N item rows, itemId 1..N, all at one location. */
function rows(n: number): ItemRow[] {
  return Array.from({ length: n }, (_, i) => row(i + 1))
}

/**
 * `locations` branches stocking the same items 1..`items`, one branch after
 * another: the layout in which consecutive pages carry the same item ids.
 */
function branches(locations: number, items: number): ItemRow[] {
  return range(1, locations).flatMap((loc) => range(1, items).map((i) => row(i, loc)))
}

function range(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i)
}

interface FakeOptions {
  /**
   * The server's own ceiling on `limit`, applied without refusing the
   * request. The envelope's per_page reports the size it really served, and
   * page N is rows ((N-1) * served, N * served]. That stride is the adapter's
   * assumption, not something GoFrugal documents: it is what makes the
   * sample's total_pages (ceil(total_records / per_page)) count real pages.
   */
  cap?: number
  /** false: answer with a bare `{ items }` (the RetailEasy sample's shape). */
  envelope?: boolean
  /** How many GETs before the fake refuses, so a runaway walk fails by name. */
  budget?: number
  /** Answer every page with page 1; the envelope echoes current_page 1. */
  ignorePage?: boolean
  /** The server's own page size whatever limit is asked; Infinity is every row at once. */
  fixedPerPage?: number
  /** per_page as reported whatever was served; total_pages is counted in it. */
  echoPerPage?: number
  /** Envelope fields left out of every response. */
  omit?: string[]
}

/** A server that answers every request with every row and no envelope: the RetailEasy reading. */
const WHOLE: FakeOptions = {
  ignorePage: true,
  fixedPerPage: Number.POSITIVE_INFINITY,
  envelope: false,
}

/**
 * A fake WebReporter that honours ONLY what GoFrugal documents for this API:
 * `page` (1-based) and `limit`, with records ((page-1)*limit, page*limit]
 * served, per_page 50 when no limit is sent. Any other query parameter is
 * refused rather than silently ignored. The options make it misbehave.
 */
function fakeGofrugal(all: ItemRow[], opts: FakeOptions = {}) {
  const calls: Record<string, unknown>[] = []
  const budget = opts.budget ?? 50
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (calls.length >= budget) {
      throw new Error(`call budget (${budget}) exceeded: the adapter kept paging`)
    }
    if (path !== '/items') throw new Error(`unexpected path ${path}`)
    const params = cfg?.params ?? {}
    calls.push(params)
    for (const key of Object.keys(params)) {
      if (key !== 'page' && key !== 'limit') {
        throw new Error(`GET /items: undocumented parameter "${key}"`)
      }
    }
    const page = params['page'] === undefined ? 1 : Number(params['page'])
    const asked = params['limit'] === undefined ? SERVER_DEFAULT_PER_PAGE : Number(params['limit'])
    if (!Number.isInteger(page) || page < 1) throw new Error(`bad page ${String(params['page'])}`)
    if (!Number.isInteger(asked) || asked < 1) {
      throw new Error(`bad limit ${String(params['limit'])}`)
    }
    const size = opts.fixedPerPage ?? Math.min(asked, opts.cap ?? Number.POSITIVE_INFINITY)
    const served = opts.ignorePage ? 1 : page
    const start = served === 1 ? 0 : (served - 1) * size
    const items = all.slice(start, start + size)
    if (opts.envelope === false) return { data: { items } }
    const perPage = opts.echoPerPage ?? (Number.isFinite(size) ? size : Math.max(all.length, 1))
    const body: Record<string, unknown> = {
      items,
      count: items.length,
      total_records: all.length,
      current_page: served,
      per_page: perPage,
      total_pages: Math.ceil(all.length / perPage),
    }
    for (const key of opts.omit ?? []) delete body[key]
    return { data: body }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  return { get, calls }
}

/** A fake that answers every request with `body`, whatever is asked. */
function fixedResponse(body: Record<string, unknown>) {
  const get = vi.fn(async () => ({ data: body }))
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  return get
}

const adapter = () => new GofrugalAdapter()
/** The adapter as the router holds it, which is what it hands parseListQuery. */
const registered = (): InventoryAdapter => adapter()

afterEach(() => vi.restoreAllMocks())

describe('gofrugal capabilities', () => {
  it('declares no maxPageSize: GoFrugal documents no maximum for /items', () => {
    expect(declaredPageMax(registered())).toBeUndefined()
  })
})

// ── Forward-page methods: one /items page is one caller page ─────────────────

interface ForwardCase {
  name: 'listProducts' | 'listStockLevels'
  call: (params: QueryParams) => Promise<{ id: string }[]>
  /** The id the method gives item row `itemId` (all rows at location 1). */
  id: (itemId: number) => string
}

const FORWARD: ForwardCase[] = [
  {
    name: 'listProducts',
    call: (p) => adapter().listProducts(CREDS, p),
    id: (i) => String(i),
  },
  {
    name: 'listStockLevels',
    call: (p) => adapter().listStockLevels(CREDS, p),
    id: (i) => `${i}:1`,
  },
]

describe.each(FORWARD)('gofrugal $name paging (GET /items, page + limit)', ({ call, id }) => {
  const ids = (start: number, count: number) => range(start, count).map(id)

  /** Drive the method as the sync worker does: withPageSink({ page, limit }). */
  async function walk(limit: number, pages: number) {
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= pages; k++) {
      const params = withPageSink({ page: k, limit })
      seen.push(...(await call(params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    return { seen, hasMore }
  }

  /** Drive the method as a client of the API does: parseListQuery + listPage. */
  async function apiWalk(limit: number, pages: number) {
    const seen: string[] = []
    const hasMore: (boolean | null)[] = []
    const totals: (number | null)[] = []
    for (let k = 1; k <= pages; k++) {
      const params = parseListQuery({ page: String(k), limit: String(limit) }, registered())
      const env = listPage(await call(params), params, 'gofrugal')
      seen.push(...env.data.map((r) => r.id))
      hasMore.push(env.meta.hasMore)
      totals.push(env.meta.totalCount)
    }
    return { seen, hasMore, totals }
  }

  it('N = 2L + 1: three worker pages serve every row once, hasMore [true, true, false]', async () => {
    const L = 4
    fakeGofrugal(rows(2 * L + 1))
    const { seen, hasMore } = await walk(L, 3)
    expect(seen).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('the page-2 request carries the documented page=2 and limit=L', async () => {
    const { calls } = fakeGofrugal(rows(9))
    await call(withPageSink({ page: 2, limit: 4 }))
    expect(calls).toEqual([{ page: 2, limit: 4 }])
  })

  it('reports the envelope: total_records as totalCount, current_page < total_pages as hasMore', async () => {
    fakeGofrugal(rows(9))
    const params = withPageSink({ page: 1, limit: 4 })
    await call(params)
    expect(readUpstreamPage(params)).toEqual({
      totalCount: 9,
      totalPages: 3,
      currentPage: 1,
      hasMore: true,
    })
  })

  it('N = 2L: page 2 ends the collection and page 3 is empty', async () => {
    const L = 4
    fakeGofrugal(rows(2 * L))
    const { seen, hasMore } = await walk(L, 3)
    expect(seen).toEqual(ids(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('walks every row at the worker limit of 500 (no declared max)', async () => {
    fakeGofrugal(rows(1001))
    const { seen, hasMore } = await walk(500, 3)
    expect(seen).toEqual(ids(1, 1001))
    expect(hasMore).toEqual([true, true, false])
  })

  it('an undisclosed server clamp is reported as pageSize, and every row is still served once', async () => {
    // The server serves at most 50 however many are asked for, and says so
    // only in per_page. Page numbers are ASSUMED to stride by the served size
    // (see FakeOptions.cap); GoFrugal does not document it.
    const { calls } = fakeGofrugal(rows(120), { cap: 50 })
    const seen: string[] = []
    const reports: unknown[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 500 })
      seen.push(...(await call(params)).map((r) => r.id))
      const meta = readUpstreamPage(params)
      reports.push({ hasMore: meta?.hasMore, pageSize: meta?.pageSize })
    }
    expect(seen).toEqual(ids(1, 120))
    expect(reports).toEqual([
      { hasMore: true, pageSize: 50 },
      { hasMore: true, pageSize: 50 },
      { hasMore: false, pageSize: 50 },
    ])
    expect(calls.map((c) => c['page'])).toEqual([1, 2, 3])
  })

  it('a limit above the router cap is clamped to 500, and every row is still served once', async () => {
    fakeGofrugal(rows(1001))
    const seen: string[] = []
    const hasMore: (boolean | null)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k), limit: '100000' }, registered())
      expect(params.limit).toBe(500)
      const env = listPage(await call(params), params, 'gofrugal')
      expect(env.meta.limit).toBe(500)
      seen.push(...env.data.map((r) => r.id))
      hasMore.push(env.meta.hasMore)
    }
    expect(seen).toEqual(ids(1, 1001))
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    const { calls } = fakeGofrugal(rows(15))
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k), limit: '7' }, registered())
      expect(params.limit).toBe(7)
      seen.push(...(await call(params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, 15))
    expect(hasMore).toEqual([true, true, false])
    expect(calls).toEqual([
      { page: 1, limit: 7 },
      { page: 2, limit: 7 },
      { page: 3, limit: 7 },
    ])
  })

  it('API path: parseListQuery + listPage publishes an exact meta.hasMore and totalCount', async () => {
    fakeGofrugal(rows(9))
    const p1 = parseListQuery({ page: '1', limit: '4' }, registered())
    const env1 = listPage(await call(p1), p1, 'gofrugal')
    expect(env1.data.map((r) => r.id)).toEqual(ids(1, 4))
    expect(env1.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 4, totalCount: 9, hasMore: true }),
    )

    const p3 = parseListQuery({ page: '3', limit: '4' }, registered())
    const env3 = listPage(await call(p3), p3, 'gofrugal')
    expect(env3.data.map((r) => r.id)).toEqual(ids(9, 1))
    expect(env3.meta).toEqual(
      expect.objectContaining({ page: 3, limit: 4, totalCount: 9, hasMore: false }),
    )
  })

  it('API path: an exact multiple of the limit ends with hasMore false, not null', async () => {
    fakeGofrugal(rows(8))
    const p2 = parseListQuery({ page: '2', limit: '4' }, registered())
    const env2 = listPage(await call(p2), p2, 'gofrugal')
    expect(env2.data.map((r) => r.id)).toEqual(ids(5, 4))
    expect(env2.meta.hasMore).toBe(false)
  })

  it('API path: a server clamp publishes meta.limit at the size actually served', async () => {
    fakeGofrugal(rows(120), { cap: 50 })
    const p2 = parseListQuery({ page: '2', limit: '100' }, registered())
    const env2 = listPage(await call(p2), p2, 'gofrugal')
    expect(env2.data.map((r) => r.id)).toEqual(ids(51, 50))
    expect(env2.meta).toEqual(
      expect.objectContaining({ page: 2, limit: 50, totalCount: 120, hasMore: true }),
    )
  })

  it('a direct call with no page or limit asks for page 1 at the adapter default size', async () => {
    const { calls } = fakeGofrugal(rows(3))
    expect((await call({})).map((r) => r.id)).toEqual(ids(1, 3))
    expect(calls).toEqual([{ page: 1, limit: 100 }])
  })

  // ── No envelope ────────────────────────────────────────────────────────────

  it('without the envelope, page 1 is one request and reports nothing rather than guessing an end', async () => {
    const { calls } = fakeGofrugal(rows(9), { envelope: false })
    const params = withPageSink({ page: 1, limit: 4 })
    expect((await call(params)).map((r) => r.id)).toEqual(ids(1, 4))
    expect(readUpstreamPage(params)).toBeUndefined()
    expect(calls).toEqual([{ page: 1, limit: 4 }])
  })

  it('without the envelope, page 2 asks for page 1 too, and serves its own rows when they differ', async () => {
    // Only page 1 tells a server that pages without an envelope from one that
    // answers every page with the whole master.
    const { calls } = fakeGofrugal(rows(9), { envelope: false })
    const params = withPageSink({ page: 2, limit: 4 })
    expect((await call(params)).map((r) => r.id)).toEqual(ids(5, 4))
    expect(readUpstreamPage(params)).toBeUndefined()
    expect(calls).toEqual([
      { page: 2, limit: 4 },
      { page: 1, limit: 4 },
    ])
  })

  it('without the envelope, a second branch with the same items is not mistaken for page 1 repeated', async () => {
    // Page 2 is items 1-4 at location 2; page 1 is items 1-4 at location 1.
    const { calls } = fakeGofrugal(branches(2, 4), { envelope: false })
    const params = withPageSink({ page: 2, limit: 4 })
    expect(await call(params)).toHaveLength(4)
    expect(readUpstreamPage(params)).toBeUndefined()
    expect(calls).toHaveLength(2)
  })

  it('without the envelope, an empty page past the end costs one request', async () => {
    const { calls } = fakeGofrugal(rows(8), { envelope: false })
    expect(await call(withPageSink({ page: 3, limit: 4 }))).toEqual([])
    expect(calls).toEqual([{ page: 3, limit: 4 }])
  })

  // ── A server that answers every page with the whole master (RetailEasy) ───

  it('whole master, larger than the limit: each worker page is cut from it, one request a page', async () => {
    const { calls } = fakeGofrugal(rows(9), WHOLE)
    const { seen, hasMore } = await walk(4, 3)
    expect(seen).toEqual(ids(1, 9))
    expect(hasMore).toEqual([true, true, false])
    expect(calls).toEqual([
      { page: 1, limit: 4 },
      { page: 2, limit: 4 },
      { page: 3, limit: 4 },
    ])
  })

  it('whole master, larger than the limit: the report is the local cut, not a guess', async () => {
    fakeGofrugal(rows(9), WHOLE)
    const params = withPageSink({ page: 1, limit: 4 })
    await call(params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
  })

  it('whole master, API path: every row once, and the last page says hasMore false', async () => {
    fakeGofrugal(rows(9), WHOLE)
    const { seen, hasMore, totals } = await apiWalk(4, 3)
    expect(seen).toEqual(ids(1, 9))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([9, 9, 9])
  })

  it('whole master no larger than the limit: page 3 sees page 1 repeated and is empty', async () => {
    const { calls } = fakeGofrugal(rows(3), WHOLE)
    const params = withPageSink({ page: 3, limit: 4 })
    expect(await call(params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual({ totalCount: 3, hasMore: false, pagedLocally: true })
    expect(calls).toEqual([
      { page: 3, limit: 4 },
      { page: 1, limit: 4 },
    ])
  })

  it('whole master of exactly the limit: the worker ends on page 2 instead of repeating page 1', async () => {
    fakeGofrugal(rows(4), WHOLE)
    const { seen, hasMore } = await walk(4, 2)
    expect(seen).toEqual(ids(1, 4))
    expect(hasMore).toEqual([undefined, false])
  })

  it('whole master with an envelope: the caller page is cut from one walk request', async () => {
    const { calls } = fakeGofrugal(rows(9), {
      ignorePage: true,
      fixedPerPage: Number.POSITIVE_INFINITY,
    })
    const { seen, hasMore } = await walk(4, 3)
    expect(seen).toEqual(ids(1, 9))
    expect(hasMore).toEqual([true, true, false])
    // Each caller page: its own request, then one walk request (total_pages 1).
    expect(calls).toHaveLength(6)
    expect(calls[1]).toEqual({ page: 1, limit: WALK })
  })

  // ── Enveloped servers that do not serve the page asked for ───────────────

  it('a server that ignores limit (per_page 50 whatever is asked): API pages of 7 serve every row once', async () => {
    const { calls } = fakeGofrugal(rows(120), { fixedPerPage: 50, budget: 200 })
    const pages = Math.ceil(120 / 7)
    const { seen, hasMore, totals } = await apiWalk(7, pages)
    expect(seen).toEqual(ids(1, 120))
    expect(hasMore).toEqual([...Array<boolean>(pages - 1).fill(true), false])
    expect(totals.every((t) => t === 120)).toBe(true)
    // The last caller page (row 120) falls on the server's empty page 18 at
    // 50 a page: a page no larger than the limit, cut locally all the same.
    expect(calls.some((c) => c['page'] === pages && c['limit'] === 7)).toBe(true)
  })

  it('a per_page larger than the limit is not the caller page, even when the rows fit it', async () => {
    // 105 rows at the server's 50 a page: its page 3 holds rows 101-105,
    // which is 5 rows, no more than the limit of 7, and not rows 15-21.
    fakeGofrugal(rows(105), { fixedPerPage: 50 })
    const params = withPageSink({ page: 3, limit: 7 })
    expect((await call(params)).map((r) => r.id)).toEqual(ids(15, 7))
    expect(readUpstreamPage(params)).toEqual({ totalCount: 105, hasMore: true, pagedLocally: true })
  })

  it('a per_page the server did not serve is ignored, not reported as a clamp', async () => {
    // per_page always 50, but the server honours limit 500: reporting 50 as
    // the page size would have the router cut 450 of these rows away.
    fakeGofrugal(rows(120), { echoPerPage: 50 })
    const params = parseListQuery({ page: '1', limit: '500' }, registered())
    const env = listPage(await call(params), params, 'gofrugal')
    expect(env.data.map((r) => r.id)).toEqual(ids(1, 120))
    expect(env.meta).toEqual(
      expect.objectContaining({ limit: 500, totalCount: 120, hasMore: false }),
    )
  })

  it('a server that ignores page (current_page 1 for page 2): the caller page is cut from a walk', async () => {
    // At the walk's 250 a page, all 9 rows arrive on its first page.
    const { calls } = fakeGofrugal(rows(9), { ignorePage: true })
    const params = withPageSink({ page: 2, limit: 4 })
    expect((await call(params)).map((r) => r.id)).toEqual(ids(5, 4))
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
    expect(calls).toEqual([
      { page: 2, limit: 4 },
      { page: 1, limit: WALK },
    ])
  })

  it('a server that ignores page and holds more than one walk page fails loudly instead of repeating page 1', async () => {
    fakeGofrugal(rows(120), { ignorePage: true, cap: 50 })
    await expect(call(withPageSink({ page: 2, limit: 4 }))).rejects.toThrow(
      "gofrugal: /items answered page 2 with page 1's rows, so only 50 of the 120 rows it reports can be read",
    )
  })

  // ── Partial and malformed envelopes ─────────────────────────────────────────

  it('total_pages without current_page: hasMore is judged at the page asked for', async () => {
    fakeGofrugal(rows(9), { omit: ['current_page'] })
    const reports: unknown[] = []
    for (const page of [2, 3]) {
      const params = withPageSink({ page, limit: 4 })
      await call(params)
      reports.push(readUpstreamPage(params))
    }
    expect(reports).toEqual([
      { totalCount: 9, totalPages: 3, hasMore: true },
      { totalCount: 9, totalPages: 3, hasMore: false },
    ])
  })

  it('envelope fields that are not whole numbers are ignored', async () => {
    const get = fixedResponse({
      items: rows(3),
      total_records: '3',
      total_pages: 1.5,
      current_page: 0,
      per_page: 0,
    })
    const params = withPageSink({ page: 1, limit: 4 })
    expect((await call(params)).map((r) => r.id)).toEqual(ids(1, 3))
    expect(readUpstreamPage(params)).toBeUndefined()
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('an empty master with total_pages 0 reports hasMore false', async () => {
    fakeGofrugal([])
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call(params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual({
      totalCount: 0,
      totalPages: 0,
      currentPage: 1,
      hasMore: false,
    })
  })
})

describe('gofrugal listProducts over several branches (known limitation, not paging)', () => {
  it('serves one product per (item, location) row, so an id repeats per branch, and totalCount counts those rows', async () => {
    // /items has one row per (itemId, locationId) (the RetailEasy sample shows
    // itemId 1 at locationId 225 and 334) and transformProduct keys a product
    // by itemId. Deduping would take a walk of the whole master per caller
    // page. totalCount matches what the list serves, row for row.
    fakeGofrugal(branches(2, 3))
    const params = parseListQuery({ page: '1', limit: '10' }, registered())
    const env = listPage(await adapter().listProducts(CREDS, params), params, 'gofrugal')
    expect(env.data.map((p) => p.id)).toEqual(['1', '2', '3', '1', '2', '3'])
    expect(env.data.map((p) => p.metadata?.['locationId'])).toEqual(['1', '1', '1', '2', '2', '2'])
    expect(env.meta).toEqual(expect.objectContaining({ totalCount: 6, hasMore: false }))
  })
})

// ── listLocations: distinct locationIds across every /items page ─────────────

/**
 * `locations` distinct locations, each on `perLocation` consecutive item
 * rows. With 15 rows a location and a server page of 50, every location past
 * the fourth first appears after row 50.
 */
function stocked(locations: number, perLocation = 15): ItemRow[] {
  const out: ItemRow[] = []
  for (let loc = 1; loc <= locations; loc++) {
    for (let j = 0; j < perLocation; j++) out.push(row(out.length + 1, loc))
  }
  return out
}

const locIds = (start: number, count: number) => range(start, count).map(String)

describe('gofrugal listLocations paging (distinct locationIds over every /items page)', () => {
  const call = (params: QueryParams) => adapter().listLocations(CREDS, params)

  async function walk(limit: number, pages: number) {
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= pages; k++) {
      const params = withPageSink({ page: k, limit })
      seen.push(...(await call(params)).map((l) => l.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    return { seen, hasMore }
  }

  it('N = 2L + 1: three worker pages serve every location once, hasMore [true, true, false]', async () => {
    const L = 4
    // 9 locations x 15 rows = 135 item rows; the server serves 50 a page, so
    // locations 5..9 exist only on upstream pages 2 and 3.
    fakeGofrugal(stocked(2 * L + 1), { cap: 50 })
    const { seen, hasMore } = await walk(L, 3)
    expect(seen).toEqual(locIds(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks /items page by page at limit 250, and stops at total_pages', async () => {
    const { calls } = fakeGofrugal(stocked(9), { cap: 50 })
    await call(withPageSink({ page: 2, limit: 4 }))
    expect(calls).toEqual([
      { page: 1, limit: 250 },
      { page: 2, limit: 250 },
      { page: 3, limit: 250 },
    ])
  })

  it('an item master that is an exact multiple of per_page ends at total_pages, with no extra request', async () => {
    // 10 locations x 10 rows = 100 rows at 50 a page: two FULL pages, so only
    // the envelope's total_pages (2) says the walk is over.
    const { calls } = fakeGofrugal(stocked(10, 10), { cap: 50 })
    const params = withPageSink({ page: 1, limit: 20 })
    expect((await call(params)).map((l) => l.id)).toEqual(locIds(1, 10))
    expect(calls.map((c) => c['page'])).toEqual([1, 2])
  })

  it('an uncapped master of two full walk pages ends at total_pages after exactly two requests', async () => {
    const { calls } = fakeGofrugal(stocked(10, 50))
    expect((await call({})).map((l) => l.id)).toEqual(locIds(1, 10))
    expect(calls).toEqual([
      { page: 1, limit: 250 },
      { page: 2, limit: 250 },
    ])
  })

  it('a long legitimate walk (40 upstream pages) completes', async () => {
    const { calls } = fakeGofrugal(stocked(40, 10), { cap: 10 })
    expect((await call({})).map((l) => l.id)).toEqual(locIds(1, 40))
    expect(calls).toHaveLength(40)
  })

  it('reports the distinct-location total and marks the page as paged locally', async () => {
    fakeGofrugal(stocked(9), { cap: 50 })
    const params = withPageSink({ page: 1, limit: 4 })
    await call(params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
  })

  it('N = 2L: page 2 ends the collection and page 3 is empty', async () => {
    const L = 4
    fakeGofrugal(stocked(2 * L), { cap: 50 })
    const { seen, hasMore } = await walk(L, 3)
    expect(seen).toEqual(locIds(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('without the envelope the walk ends on an empty page, not on a short one', async () => {
    // 9 x 30 = 270 rows: one full page of 250, then 20, then an empty page.
    const { calls } = fakeGofrugal(stocked(9, 30), { envelope: false })
    const { seen, hasMore } = await walk(4, 3)
    expect(seen).toEqual(locIds(1, 9))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.slice(0, 3)).toEqual([
      { page: 1, limit: 250 },
      { page: 2, limit: 250 },
      { page: 3, limit: 250 },
    ])
    expect(calls).toHaveLength(9)
  })

  it('without the envelope, a server that silently serves 50 of the 250 asked for loses no location', async () => {
    // Every page is "short", so a walk that ended on a short page would stop
    // after page 1 with one location of six.
    const { calls } = fakeGofrugal(stocked(6, 50), { cap: 50, envelope: false })
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await call(params)).map((l) => l.id)).toEqual(locIds(1, 6))
    expect(readUpstreamPage(params)).toEqual({ totalCount: 6, hasMore: false, pagedLocally: true })
    expect(calls.map((c) => c['page'])).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('whole master larger than the walk page: one request', async () => {
    const { calls } = fakeGofrugal(stocked(9, 30), WHOLE)
    expect((await call(withPageSink({ page: 1, limit: 4 }))).map((l) => l.id)).toEqual(locIds(1, 4))
    expect(calls).toEqual([{ page: 1, limit: 250 }])
  })

  it('whole master no larger than the walk page: ends when page 2 repeats page 1', async () => {
    const { calls } = fakeGofrugal(stocked(9), WHOLE)
    expect((await call({})).map((l) => l.id)).toEqual(locIds(1, 9))
    expect(calls).toEqual([
      { page: 1, limit: 250 },
      { page: 2, limit: 250 },
    ])
  })

  it('two branches stocking the same items, one walk page each, are not mistaken for a repeat', async () => {
    // Walk page 2 is items 1-250 at location 2, the same item ids as page 1.
    const { calls } = fakeGofrugal(branches(2, 250))
    expect((await call({})).map((l) => l.id)).toEqual(['1', '2'])
    expect(calls).toHaveLength(2)
  })

  it('whole master behind an envelope with no total_pages: ends when page 2 repeats every row counted', async () => {
    const { calls } = fakeGofrugal(stocked(9, 30), {
      ignorePage: true,
      fixedPerPage: Number.POSITIVE_INFINITY,
      omit: ['total_pages'],
    })
    expect((await call({})).map((l) => l.id)).toEqual(locIds(1, 9))
    expect(calls).toHaveLength(2)
  })

  it('a server that ignores limit (per_page 50 whatever is asked) is walked to total_pages', async () => {
    const { calls } = fakeGofrugal(stocked(9), { fixedPerPage: 50 })
    expect((await call({})).map((l) => l.id)).toEqual(locIds(1, 9))
    expect(calls.map((c) => c['page'])).toEqual([1, 2, 3])
  })

  it('a server that ignores page while counting more rows fails loudly instead of truncating', async () => {
    const { calls } = fakeGofrugal(stocked(9), { ignorePage: true, cap: 50 })
    await expect(call({})).rejects.toThrow(
      "gofrugal: /items answered page 2 with page 1's rows, so only 50 of the 135 rows it reports can be read",
    )
    expect(calls).toHaveLength(2)
  })

  it('a limit above the router cap is clamped to 500 and serves every location', async () => {
    fakeGofrugal(stocked(9), { cap: 50 })
    const params = parseListQuery({ page: '1', limit: '100000' }, registered())
    expect(params.limit).toBe(500)
    const env = listPage(await call(params), params, 'gofrugal')
    expect(env.data.map((l) => l.id)).toEqual(locIds(1, 9))
    expect(env.meta.hasMore).toBe(false)
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    fakeGofrugal(stocked(15), { cap: 50, budget: 100 })
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k), limit: '7' }, registered())
      expect(params.limit).toBe(7)
      seen.push(...(await call(params)).map((l) => l.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(locIds(1, 15))
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage publishes an exact meta.hasMore and totalCount', async () => {
    fakeGofrugal(stocked(9), { cap: 50 })
    const p1 = parseListQuery({ page: '1', limit: '4' }, registered())
    const env1 = listPage(await call(p1), p1, 'gofrugal')
    expect(env1.data.map((l) => l.id)).toEqual(locIds(1, 4))
    expect(env1.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 4, totalCount: 9, hasMore: true }),
    )

    const p3 = parseListQuery({ page: '3', limit: '4' }, registered())
    const env3 = listPage(await call(p3), p3, 'gofrugal')
    expect(env3.data.map((l) => l.id)).toEqual(locIds(9, 1))
    expect(env3.meta).toEqual(
      expect.objectContaining({ page: 3, limit: 4, totalCount: 9, hasMore: false }),
    )
  })

  it('an empty item master is an empty location list, after one request', async () => {
    const { calls } = fakeGofrugal([])
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await call(params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ totalCount: 0, hasMore: false }),
    )
    expect(calls).toHaveLength(1)
  })

  it('a server that never ends the walk fails loudly after exactly 10,000 requests', async () => {
    // A fresh row on every page, no envelope: never empty, never a repeat.
    let n = 0
    const get = vi.fn(async () => ({ data: { items: [row(++n)] } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
    await expect(call(withPageSink({ page: 1, limit: 4 }))).rejects.toThrow(
      'gofrugal: /items ran to more than 10000 pages without ending',
    )
    expect(get).toHaveBeenCalledTimes(10_000)
  })
})

// ── get*: walk /items until the row appears ───────────────────────────────────

describe('gofrugal get* lookups walk /items past its first page', () => {
  it('getProduct finds an item past the first server page, and stops walking there', async () => {
    const { calls } = fakeGofrugal(rows(120), { cap: 50 })
    const product = await adapter().getProduct(CREDS, '60')
    expect(product.id).toBe('60')
    expect(calls).toEqual([
      { page: 1, limit: 250 },
      { page: 2, limit: 250 },
    ])
  })

  it('getProduct walks the whole master before saying not found', async () => {
    const { calls } = fakeGofrugal(rows(120), { cap: 50 })
    await expect(adapter().getProduct(CREDS, '999')).rejects.toThrow(
      'gofrugal: product 999 not found',
    )
    expect(calls.map((c) => c['page'])).toEqual([1, 2, 3])
  })

  it('getStockLevel finds an (item, location) past the first server page', async () => {
    const { calls } = fakeGofrugal(rows(120), { cap: 50 })
    const level = await adapter().getStockLevel(CREDS, '110:1')
    expect(level).toEqual(
      expect.objectContaining({
        id: '110:1',
        productId: '110',
        locationId: '1',
        quantityOnHand: 110,
      }),
    )
    expect(calls.map((c) => c['page'])).toEqual([1, 2, 3])
  })

  it('getStockLevel on an item at another location is not found', async () => {
    fakeGofrugal(rows(120), { cap: 50 })
    await expect(adapter().getStockLevel(CREDS, '60:2')).rejects.toThrow(
      'gofrugal: stock level 60:2 not found',
    )
  })

  it('getLocation finds a location past the first 100 distinct ones, on a later /items page', async () => {
    fakeGofrugal(stocked(120, 1), { cap: 50 })
    const loc = await adapter().getLocation(CREDS, '110')
    expect(loc).toEqual(expect.objectContaining({ id: '110', name: 'Location 110' }))
  })

  it('getLocation stops walking at the page that holds the location', async () => {
    const { calls } = fakeGofrugal(stocked(9), { cap: 50 })
    expect((await adapter().getLocation(CREDS, '2')).id).toBe('2')
    expect(calls).toEqual([{ page: 1, limit: 250 }])
  })

  it('getLocation skips rows with no locationId, as listLocations does', async () => {
    const { locationId: _dropped, ...unplaced } = row(1)
    fixedResponse({
      items: [unplaced],
      total_records: 1,
      current_page: 1,
      per_page: 250,
      total_pages: 1,
    })
    expect(await adapter().listLocations(CREDS, {})).toEqual([])
    await expect(adapter().getLocation(CREDS, 'undefined')).rejects.toThrow(
      'gofrugal: location undefined not found',
    )
  })

  it('getLocation on an unknown location walks everything, then says not found', async () => {
    const { calls } = fakeGofrugal(stocked(9), { cap: 50 })
    await expect(adapter().getLocation(CREDS, '10')).rejects.toThrow(
      'gofrugal: location 10 not found',
    )
    expect(calls).toHaveLength(3)
  })

  it('against a whole-master server a lookup is one request', async () => {
    const { calls } = fakeGofrugal(rows(300), WHOLE)
    expect((await adapter().getProduct(CREDS, '290')).id).toBe('290')
    expect(calls).toEqual([{ page: 1, limit: 250 }])
  })
})
