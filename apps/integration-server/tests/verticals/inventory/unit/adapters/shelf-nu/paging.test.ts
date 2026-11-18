/**
 * Shelf.nu list paging: GET /api/mobile/locations and GET /api/mobile/assets
 * both page by page number, each with its own perPage ceiling.
 *
 * Shelf publishes no API reference; the mobile API is defined by the route
 * source in its own open-source repository, which is the first-party record
 * (https://github.com/Shelf-nu/shelf.nu, apps/webapp/app/routes/api+/mobile+/).
 * Since upstream commit 290d166c (2026-07-22) the locations.ts loader reads:
 *
 *     const page = Math.max(
 *       1,
 *       parseInt(url.searchParams.get("page") || "1", 10) || 1
 *     );
 *     const perPage = Math.min(
 *       100,
 *       Math.max(1, parseInt(url.searchParams.get("perPage") || "50", 10) || 50)
 *
 * orders by name ascending, skips `(page - 1) * perPage`, and answers
 * `{ locations, page, perPage, totalCount, totalPages }` with
 * `totalPages: Math.max(1, Math.ceil(totalCount / perPage))`. Before that
 * commit it ignored page and perPage and answered `{ locations }` from one
 * `take: 50` query.
 *
 * The assets.ts loader reads:
 *
 *     const rawPage = parseInt(url.searchParams.get("page") || "1", 10);
 *     const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
 *     const rawPerPage = parseInt(url.searchParams.get("perPage") || "20", 10);
 *     const perPage = Number.isNaN(rawPerPage)
 *       ? 20
 *       : Math.min(50, Math.max(1, rawPerPage));
 *
 * and answers `{ assets, page, perPage, totalCount, totalPages }` with
 * `totalPages: Math.ceil(totalCount / perPage)`. Asking it for more than 50
 * gets 50, so a method that asked for 100 would read every full page as the
 * last one.
 *
 * Before the fix the adapter was still written against the old locations route:
 * it sent only `orgId` (and `search`), so every caller page was upstream page 1
 * at the default 50 rows, and getLocation could not find any location past the
 * first 50 by name.
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
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'
import { ShelfNuAdapter } from '../../../../../../src/verticals/inventory/adapters/shelf-nu/index'

const ORG = 'org-test-1'
const CREDS = { accessToken: 'shelf_jwt_test', extra: { organizationId: ORG } }
/** The locations route's documented perPage ceiling. */
const MAX = 100
/** The assets route's documented perPage ceiling. */
const ASSETS_MAX = 50
/**
 * No case here needs more than a handful of upstream reads. A loop that keeps
 * paging past the end fails by name instead of running the worker out of
 * memory.
 */
const CALL_BUDGET = 20

const pad = (n: number) => String(n).padStart(4, '0')

/** Names sort in id order, so the route's `orderBy: { name: "asc" }` is id order. */
function locations(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `loc-${pad(i + 1)}`,
    name: `Room ${pad(i + 1)}`,
    description: null,
    image: null,
    parentId: null,
  }))
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `loc-${pad(start + i)}`)
}

/** The documented query parameters of GET /api/mobile/locations. */
const DOCUMENTED = new Set(['orgId', 'search', 'page', 'perPage'])

/**
 * A fake Shelf that honours ONLY what the route source reads: `orgId`,
 * `search`, `page` and `perPage`, parsed from the query string exactly as the
 * loader parses them. Any other parameter is refused rather than silently
 * ignored.
 */
function fakeShelf(total: number) {
  const all = locations(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) {
      throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
    }
    if (path !== '/api/mobile/locations') throw new Error(`unexpected path ${path}`)
    const q = cfg?.params ?? {}
    for (const key of Object.keys(q)) {
      if (!DOCUMENTED.has(key)) throw new Error(`GET ${path} does not read "${key}"`)
    }
    if (q['orgId'] !== ORG) throw new Error(`orgId missing or wrong: ${String(q['orgId'])}`)
    // What `url.searchParams.get(...)` would hand the loader.
    const param = (k: string) => (q[k] === undefined ? null : String(q[k]))
    const page = Math.max(1, parseInt(param('page') || '1', 10) || 1)
    const perPage = Math.min(100, Math.max(1, parseInt(param('perPage') || '50', 10) || 50))
    const search = (param('search') || '').toLowerCase()
    const rows = all
      .filter((l) => !search || l.name.toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name))
    return {
      data: {
        locations: rows.slice((page - 1) * perPage, page * perPage),
        page,
        perPage,
        totalCount: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / perPage)),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

/**
 * The locations route before 290d166c: one `take: 50` list as `{ locations }`,
 * whatever page and perPage say. `search` it did read. `take` is a parameter
 * only so one case can check the adapter's window against a longer list.
 */
function fakePrePagingShelf(total: number, take = 50) {
  const all = locations(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) {
      throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
    }
    if (path !== '/api/mobile/locations') throw new Error(`unexpected path ${path}`)
    const search = String(cfg?.params?.['search'] ?? '').toLowerCase()
    const rows = all.filter((l) => !search || l.name.toLowerCase().includes(search))
    return { data: { locations: rows.slice(0, take) } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

/** Assets in the route's order (createdAt desc, then id): here, id order. */
function assetRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `ast-${pad(i + 1)}`,
    title: i % 2 === 0 ? `Drill ${pad(i + 1)}` : `Ladder ${pad(i + 1)}`,
    status: 'AVAILABLE',
    createdAt: new Date(Date.UTC(2026, 0, 1) - i * 60_000).toISOString(),
  }))
}

function assetIds(start: number, count: number, step = 1): string[] {
  return Array.from({ length: count }, (_, i) => `ast-${pad(start + i * step)}`)
}

/** The documented query parameters of GET /api/mobile/assets. */
const DOCUMENTED_ASSETS = new Set(['orgId', 'search', 'page', 'perPage', 'myCustody', 'status'])

/**
 * A fake Shelf assets route: honours only its documented parameters, parsed
 * and clamped exactly as the loader does (perPage defaults to 20 and is capped
 * at 50), and answers `totalPages: Math.ceil(totalCount / perPage)`, which is 0
 * for no rows. `search` is modelled as a case-insensitive title match; the
 * real route matches more fields, which no case here depends on.
 */
function fakeAssets(total: number) {
  const all = assetRows(total)
  let calls = 0
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (++calls > CALL_BUDGET) {
      throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
    }
    if (path !== '/api/mobile/assets') throw new Error(`unexpected path ${path}`)
    const q = cfg?.params ?? {}
    for (const key of Object.keys(q)) {
      if (!DOCUMENTED_ASSETS.has(key)) throw new Error(`GET ${path} does not read "${key}"`)
    }
    if (q['orgId'] !== ORG) throw new Error(`orgId missing or wrong: ${String(q['orgId'])}`)
    const param = (k: string) => (q[k] === undefined ? null : String(q[k]))
    const rawPage = parseInt(param('page') || '1', 10)
    const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage)
    const rawPerPage = parseInt(param('perPage') || '20', 10)
    const perPage = Number.isNaN(rawPerPage) ? 20 : Math.min(50, Math.max(1, rawPerPage))
    const search = (param('search') || '').slice(0, 100).toLowerCase()
    const rows = all.filter((a) => !search || a.title.toLowerCase().includes(search))
    return {
      data: {
        assets: rows.slice((page - 1) * perPage, page * perPage),
        page,
        perPage,
        totalCount: rows.length,
        totalPages: Math.ceil(rows.length / perPage),
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

const adapter = () => new ShelfNuAdapter()
/** The adapter as the router holds it, which is what parseListQuery reads. */
const routed = (a: ShelfNuAdapter): InventoryAdapter => a
const call = (params: QueryParams) => adapter().listLocations(CREDS, params)

/** Drive the method as the sync worker does: withPageSink({ page, limit }). */
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

afterEach(() => vi.restoreAllMocks())

describe('shelf-nu capabilities', () => {
  it('declares no adapter-wide maxPageSize: assets cap at 50 and locations at 100, each reported per call', () => {
    expect(declaredPageMax(routed(adapter()))).toBeUndefined()
  })
})

describe('shelf-nu listLocations paging (GET /api/mobile/locations, page + perPage)', () => {
  it('N = 2L + 1: three worker pages serve every location once, hasMore [true, true, false]', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeShelf(N)
    const { seen, hasMore } = await walk(L, 3)
    expect(seen).toEqual(ids(1, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 sends the documented page=2 and perPage=L', async () => {
    const L = 4
    const { get } = fakeShelf(2 * L + 1)
    const params = withPageSink({ page: 2, limit: L })
    expect((await call(params)).map((l) => l.id)).toEqual(ids(L + 1, L))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]?.[1]?.params).toEqual({ orgId: ORG, page: 2, perPage: L })
  })

  it('a params object without a page asks for page 1', async () => {
    const { get } = fakeShelf(9)
    await call(withPageSink({ limit: 4 }))
    expect(get.mock.calls[0]?.[1]?.params).toMatchObject({ page: 1, perPage: 4 })
  })

  it('reports the platform total and its end, and the size it asked for', async () => {
    fakeShelf(9)
    const params = withPageSink({ page: 1, limit: 4 })
    await call(params)
    expect(readUpstreamPage(params)).toEqual({
      pageSize: 4,
      totalCount: 9,
      totalPages: 3,
      hasMore: true,
    })
  })

  it('N = 2L: page 2 ends the collection and page 3 is empty', async () => {
    const L = 4
    fakeShelf(2 * L)
    const { seen, hasMore } = await walk(L, 3)
    expect(seen).toEqual(ids(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('a limit above the documented max (100) is clamped to 100 and every location is still served once', async () => {
    const N = 2 * MAX + 1
    const { get } = fakeShelf(N)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    const pageSize: (number | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 250 })
      seen.push(...(await call(params)).map((l) => l.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      pageSize.push(readUpstreamPage(params)?.pageSize)
    }
    expect(seen).toEqual(ids(1, N))
    expect(hasMore).toEqual([true, true, false])
    expect(pageSize).toEqual([MAX, MAX, MAX])
    expect(get.mock.calls.map((c) => c[1]?.params?.['perPage'])).toEqual([MAX, MAX, MAX])
  })

  it('walks every location at the worker limit of 500 (no declared max)', async () => {
    fakeShelf(2 * MAX + 1)
    const { seen, hasMore } = await walk(500, 3)
    expect(seen).toEqual(ids(1, 2 * MAX + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('search composes with paging: forwarded on every page, total counts only the matches', async () => {
    // "Room 00" matches Room 0001..0099 of 150.
    const { get } = fakeShelf(150)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 40, search: 'Room 00' })
      seen.push(...(await call(params)).map((l) => l.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(99)
    }
    expect(seen).toEqual(ids(1, 99))
    expect(hasMore).toEqual([true, true, false])
    for (const c of get.mock.calls) expect(c[1]?.params?.['search']).toBe('Room 00')
  })

  it('a search that trims to nothing is not sent: the router reads it as no filter, and so does Shelf', async () => {
    // Shelf would apply " " as a literal `contains`: every "Room nnnn" name
    // holds a space, but a caller's blank term must not filter at all.
    const { get } = fakeShelf(9)
    const params = withPageSink({ page: 1, limit: 4, search: '   ' })
    expect((await call(params)).map((l) => l.id)).toEqual(ids(1, 4))
    expect(get.mock.calls[0]?.[1]?.params).toEqual({ orgId: ORG, page: 1, perPage: 4 })
    expect(readUpstreamPage(params)?.totalCount).toBe(9)
  })

  it('a search term is sent without its surrounding whitespace', async () => {
    const { get } = fakeShelf(150)
    const params = withPageSink({ page: 1, limit: 40, search: '  Room 01 ' })
    await call(params)
    expect(get.mock.calls[0]?.[1]?.params).toEqual({
      orgId: ORG,
      search: 'Room 01',
      page: 1,
      perPage: 40,
    })
    // Room 0100..0150 hold "room 01" once the blanks are gone; no name holds
    // "  room 01 ", which is what the untrimmed term would have matched.
    expect(readUpstreamPage(params)?.totalCount).toBe(51)
  })
})

describe('shelf-nu listLocations against the pre-paging route (no totalPages)', () => {
  it('pages the one list locally: every location once, then the end', async () => {
    const { get } = fakePrePagingShelf(30)
    const { seen, hasMore } = await walk(20, 3)
    expect(seen).toEqual(ids(1, 30))
    expect(hasMore).toEqual([true, false, false])
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('reports the end of the list at the size it cut, and no total the route never stated', async () => {
    fakePrePagingShelf(30)
    const params = withPageSink({ page: 2, limit: 20 })
    expect((await call(params)).map((l) => l.id)).toEqual(ids(21, 10))
    // No `pagedLocally` either: the requests themselves page and follow the
    // limit, so the paging-contract gate keeps judging them.
    expect(readUpstreamPage(params)).toEqual({ pageSize: 20, hasMore: false })
  })

  it('the route answers at most 50: those are served once, at the worker limit too', async () => {
    fakePrePagingShelf(80)
    const small = await walk(20, 3)
    expect(small.seen).toEqual(ids(1, 50))
    expect(small.hasMore).toEqual([true, true, false])

    const worker = await walk(500, 2)
    expect(worker.seen).toEqual(ids(1, 50))
    expect(worker.hasMore).toEqual([false, false])
  })

  it('N = 2L: page 2 ends the list, so no empty page 3 is asked for', async () => {
    fakePrePagingShelf(40)
    const { seen, hasMore } = await walk(20, 2)
    expect(seen).toEqual(ids(1, 40))
    expect(hasMore).toEqual([true, false])
  })

  it('the window is cut at the page size it reported (100 for a larger limit), not at the limit', async () => {
    // The real pre-paging route never answers more than 50; this list is
    // longer only to show the cut and the reported size agree.
    fakePrePagingShelf(150, Infinity)
    const seen: string[] = []
    const report = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 250 })
      seen.push(...(await call(params)).map((l) => l.id))
      report.push(readUpstreamPage(params))
    }
    expect(seen).toEqual(ids(1, 150))
    expect(report).toEqual([
      { pageSize: MAX, hasMore: true },
      { pageSize: MAX, hasMore: false },
      { pageSize: MAX, hasMore: false },
    ])
  })

  it('through the API path, page 2 moves on and meta.hasMore ends, instead of repeating page 1 forever', async () => {
    fakePrePagingShelf(30)
    const a = adapter()
    const pages = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '20' }, routed(a))
      pages.push(listPage(await a.listLocations(CREDS, params), params, 'shelf-nu'))
    }
    expect(pages.map((p) => p.data.map((l) => l.id))).toEqual([ids(1, 20), ids(21, 10), []])
    expect(pages.map((p) => p.meta.hasMore)).toEqual([true, false, false])
    expect(pages.map((p) => p.meta.totalCount)).toEqual([null, null, null])
  })
})

describe('shelf-nu listProducts and listStockLevels paging (GET /api/mobile/assets, perPage at most 50)', () => {
  const products = (params: QueryParams) => adapter().listProducts(CREDS, params)
  const stockLevels = (params: QueryParams) => adapter().listStockLevels(CREDS, params)

  async function walkAssets(
    list: (params: QueryParams) => Promise<Array<{ id: string }>>,
    limit: number,
    pages: number,
  ) {
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    const pageSize: (number | undefined)[] = []
    for (let k = 1; k <= pages; k++) {
      const params = withPageSink({ page: k, limit })
      seen.push(...(await list(params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      pageSize.push(readUpstreamPage(params)?.pageSize)
    }
    return { seen, hasMore, pageSize }
  }

  it('the worker limit of 500 asks for 50 a page and serves 120 assets once over three pages', async () => {
    const { get } = fakeAssets(120)
    const { seen, hasMore, pageSize } = await walkAssets(products, 500, 3)
    expect(seen).toEqual(assetIds(1, 120))
    expect(hasMore).toEqual([true, true, false])
    expect(pageSize).toEqual([ASSETS_MAX, ASSETS_MAX, ASSETS_MAX])
    expect(get.mock.calls.map((c) => c[1]?.params)).toEqual([
      { orgId: ORG, page: 1, perPage: ASSETS_MAX },
      { orgId: ORG, page: 2, perPage: ASSETS_MAX },
      { orgId: ORG, page: 3, perPage: ASSETS_MAX },
    ])
  })

  it('stock levels page the same route the same way', async () => {
    const { get } = fakeAssets(120)
    const { seen, hasMore, pageSize } = await walkAssets(stockLevels, 500, 3)
    expect(seen).toEqual(assetIds(1, 120).map((id) => `${id}:`))
    expect(hasMore).toEqual([true, true, false])
    expect(pageSize).toEqual([ASSETS_MAX, ASSETS_MAX, ASSETS_MAX])
    expect(get.mock.calls.map((c) => c[1]?.params?.['page'])).toEqual([1, 2, 3])
    expect(get.mock.calls.map((c) => c[1]?.params?.['perPage'])).toEqual([50, 50, 50])
  })

  it('a limit below the ceiling is sent as asked, and page N is upstream page N', async () => {
    const { get } = fakeAssets(9)
    const { seen, hasMore } = await walkAssets(products, 4, 3)
    expect(seen).toEqual(assetIds(1, 9))
    expect(hasMore).toEqual([true, true, false])
    expect(get.mock.calls.map((c) => c[1]?.params)).toEqual([
      { orgId: ORG, page: 1, perPage: 4 },
      { orgId: ORG, page: 2, perPage: 4 },
      { orgId: ORG, page: 3, perPage: 4 },
    ])
  })

  it('reports the platform total and its end beside the size it asked for', async () => {
    fakeAssets(120)
    const params = withPageSink({ page: 1, limit: 500 })
    await products(params)
    expect(readUpstreamPage(params)).toEqual({
      pageSize: ASSETS_MAX,
      totalCount: 120,
      totalPages: 3,
      hasMore: true,
    })
  })

  it('an exact multiple of 50 ends on its full last page, with no extra request', async () => {
    fakeAssets(100)
    const { seen, hasMore } = await walkAssets(products, 500, 2)
    expect(seen).toEqual(assetIds(1, 100))
    expect(hasMore).toEqual([true, false])
  })

  it('no assets at all is the end (the route counts 0 pages)', async () => {
    fakeAssets(0)
    const params = withPageSink({ page: 1, limit: 500 })
    expect(await products(params)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 0, totalPages: 0, hasMore: false })
  })

  it('through the API path, the default limit is judged at the 50 the route serves', async () => {
    fakeAssets(120)
    const a = adapter()
    const pages = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page }, routed(a))
      pages.push(listPage(await a.listProducts(CREDS, params), params, 'shelf-nu'))
    }
    expect(pages.map((p) => p.data.map((r) => r.id))).toEqual([
      assetIds(1, 50),
      assetIds(51, 50),
      assetIds(101, 20),
    ])
    expect(pages.map((p) => p.meta.limit)).toEqual([ASSETS_MAX, ASSETS_MAX, ASSETS_MAX])
    expect(pages.map((p) => p.meta.hasMore)).toEqual([true, true, false])
    expect(pages.map((p) => p.meta.totalCount)).toEqual([120, 120, 120])
  })

  it('search is forwarded on every page, and the total counts only the matches', async () => {
    // Odd-numbered assets are drills: 60 of 120.
    const { get } = fakeAssets(120)
    const { seen, hasMore } = await walkAssets(
      (params) => products(Object.assign(params, { search: ' drill ' })),
      25,
      3,
    )
    expect(seen).toEqual(assetIds(1, 60, 2))
    expect(hasMore).toEqual([true, true, false])
    for (const c of get.mock.calls) expect(c[1]?.params?.['search']).toBe('drill')
  })

  it('stock levels forward search too', async () => {
    const { get } = fakeAssets(10)
    const params = withPageSink({ page: 1, limit: 50, search: 'Ladder' })
    expect((await stockLevels(params)).map((s) => s.productId)).toEqual(assetIds(2, 5, 2))
    expect(get.mock.calls[0]?.[1]?.params).toEqual({
      orgId: ORG,
      search: 'Ladder',
      page: 1,
      perPage: 50,
    })
    expect(readUpstreamPage(params)?.totalCount).toBe(5)
  })

  it('a blank search is not sent to the assets route either', async () => {
    const { get } = fakeAssets(10)
    await products(withPageSink({ page: 1, limit: 50, search: ' ' }))
    expect(get.mock.calls[0]?.[1]?.params).toEqual({ orgId: ORG, page: 1, perPage: 50 })
  })
})

describe('shelf-nu listLocations through the API path (parseListQuery + listPage)', () => {
  async function apiPage(query: Record<string, string>) {
    const a = adapter()
    const params = parseListQuery(query, routed(a))
    const items = await a.listLocations(CREDS, params)
    return { params, envelope: listPage(items, params, 'shelf-nu') }
  }

  it('forwards the limit as delivered by parseListQuery', async () => {
    const { get } = fakeShelf(9)
    await apiPage({ page: '2', limit: '4' })
    expect(get.mock.calls[0]?.[1]?.params).toEqual({ orgId: ORG, page: 2, perPage: 4 })
  })

  it('meta.hasMore is true before the last page and false on it, with the platform total', async () => {
    fakeShelf(9)
    const p1 = (await apiPage({ page: '1', limit: '4' })).envelope
    expect(p1.data.map((l) => l.id)).toEqual(ids(1, 4))
    expect(p1.meta).toMatchObject({ page: 1, limit: 4, totalCount: 9, hasMore: true })

    const p3 = (await apiPage({ page: '3', limit: '4' })).envelope
    expect(p3.data.map((l) => l.id)).toEqual(ids(9, 1))
    expect(p3.meta).toMatchObject({ page: 3, limit: 4, totalCount: 9, hasMore: false })
  })

  it('N = 2L: the full last page reads hasMore false, not the unknown a short-page guess gives', async () => {
    fakeShelf(8)
    const p2 = (await apiPage({ page: '2', limit: '4' })).envelope
    expect(p2.data.map((l) => l.id)).toEqual(ids(5, 4))
    expect(p2.meta.hasMore).toBe(false)
  })

  it('the default limit (100) and a larger one are judged at the 100 actually asked for', async () => {
    fakeShelf(2 * MAX + 1)
    const d = (await apiPage({})).envelope
    expect(d.data).toHaveLength(MAX)
    expect(d.meta).toMatchObject({ limit: MAX, totalCount: 2 * MAX + 1, hasMore: true })

    const big = (await apiPage({ page: '3', limit: '250' })).envelope
    expect(big.data.map((l) => l.id)).toEqual(ids(2 * MAX + 1, 1))
    expect(big.meta).toMatchObject({ page: 3, limit: MAX, hasMore: false })
  })
})

describe('shelf-nu getLocation walks the paged list', () => {
  it('finds a location past the first page, asking at the documented max', async () => {
    const { get } = fakeShelf(250)
    const loc = await adapter().getLocation(CREDS, 'loc-0250')
    expect(loc.id).toBe('loc-0250')
    expect(get.mock.calls.map((c) => c[1]?.params)).toEqual([
      { orgId: ORG, page: 1, perPage: MAX },
      { orgId: ORG, page: 2, perPage: MAX },
      { orgId: ORG, page: 3, perPage: MAX },
    ])
  })

  it('stops at the first page that holds the id', async () => {
    const { get } = fakeShelf(250)
    await adapter().getLocation(CREDS, 'loc-0007')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('reports not found only after the last page, and does not read past it', async () => {
    const { get } = fakeShelf(250)
    await expect(adapter().getLocation(CREDS, 'loc-9999')).rejects.toThrow(/not found/)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('not found carries a 404, so the route answers 404 NOT_FOUND rather than 500', async () => {
    fakeShelf(250)
    await expect(adapter().getLocation(CREDS, 'loc-9999')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('matches on the id, never on a name', async () => {
    fakeShelf(9)
    await expect(adapter().getLocation(CREDS, 'Room 0005')).rejects.toThrow(/not found/)
  })

  it('a response with no totalPages ends the walk after one request', async () => {
    // The pre-2026-07 route: one list, no paging fields, whatever is asked.
    let calls = 0
    const get = vi.fn(async () => {
      if (++calls > CALL_BUDGET) {
        throw new Error(`call budget (${CALL_BUDGET}) exceeded: the adapter kept paging`)
      }
      return { data: { locations: locations(3) } }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
    await expect(adapter().getLocation(CREDS, 'loc-0099')).rejects.toThrow(/not found/)
    expect(get).toHaveBeenCalledTimes(1)
  })
})
