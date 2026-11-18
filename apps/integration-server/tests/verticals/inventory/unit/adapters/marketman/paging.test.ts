/**
 * MarketMan list paging.
 *
 * Every quote below is from MarketMan's own API documentation, a Postman
 * Documenter collection on its domain
 * (https://api-doc.marketman.com/api/collections/10610779/T1LPET6f?segregateAuth=true&versionTag=latest).
 *
 *   - POST /buyers/inventory/GetInventoryItems pages by offset. Its input table
 *     documents `Skip` ("Optional. State the number of items to skip") and
 *     `Take` ("Optional. Will only request the inserted amount. Maximum of 500
 *     at a time. Used with 'Skip'"), and its example response ends with
 *     `MaxTakeAllowed: 500` and `Page: { Skip: 3, Take: 5, Total: null }`.
 *     listProducts forwards the caller's page as Skip/Take, and the adapter
 *     declares maxPageSize 500. listLocations derives storage areas from the
 *     items, de-duplicated across item pages, so it walks every page and
 *     slices the result.
 *   - GetInventoryCounts ("Gets all inventory counts"), GetOrdersBySentDate
 *     ("Gets all orders according to sent date range.") and GetTransfers
 *     ("Gets all transfers.") take a date window and no paging input, so the
 *     adapter slices the whole window's rows into the caller's pages.
 *     GetInventoryCounts documents `GetLineDetails` as "Optional (Default is
 *     false) Whether to get the Lines array object.If false, the lines would
 *     be null.", so stock levels (flattened from those lines) need it sent.
 *     GetVendors (POST /buyers/items/GetVendors, "Gets all vendors your account
 *     is connected to") takes no input but BuyerGuid, and is sliced the same way.
 *   - Errors arrive over HTTP 200 in the body. The docs' "API Limitations":
 *     "If this limit is reached, a notification will be sent in the response.
 *     Example: { "IsSuccess": false, "ErrorMessage": "Reached max calls" }".
 *     With no Items/Orders/... key, that body read as a list is an empty last
 *     page, so it must fail the call instead.
 *
 * Before the fix every list sent `{ BuyerGuid }` plus at most a date window
 * whatever page was asked for: page 2 repeated page 1, and rows past the
 * first page were unreachable.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import Fastify from 'fastify'
import {
  attachAdapterErrorHandler,
  declaredPageMax,
  effectivePageSize,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { MarketmanAdapter } from '../../../../../../src/verticals/inventory/adapters/marketman/index'

const BUYER = 'buyer-1'
const CREDS = { accessToken: 'mm_test', extra: { buyerGuid: BUYER } }
/** GetInventoryItems: "Maximum of 500 at a time." */
const MAX_TAKE = 500
/**
 * No case here needs more upstream reads than this unless it says so. A loop
 * that keeps paging past the end fails by name instead of hanging the worker.
 */
const CALL_BUDGET = 40

const ITEMS = '/buyers/inventory/GetInventoryItems'
const COUNTS = '/buyers/inventory/GetInventoryCounts'
const ORDERS = '/buyers/orders/GetOrdersBySentDate'
const TRANSFERS = '/buyers/inventory/GetTransfers'
/**
 * GetVendors, documented as POST https://api.marketman.com/v3/buyers/items/GetVendors
 * ("Gets all vendors your account is connected to"). Its input table is
 * BuyerGuid only, and its Vendors array documents `Guid` ("Vendor guid") and
 * `Name`. The path the adapter used to call, /buyers/inventory/GetVendors,
 * appears nowhere in the docs, so the fake refuses it as undocumented.
 */
const VENDORS = '/buyers/items/GetVendors'

/** The docs' "API Limitations" quota notice, answered over HTTP 200. */
const QUOTA_BODY = { IsSuccess: false, ErrorMessage: 'Reached max calls' }

/** Each endpoint's documented input table, and nothing else. */
const DOCUMENTED_INPUTS: Record<string, readonly string[]> = {
  [VENDORS]: ['BuyerGuid'],
  [ITEMS]: [
    'BuyerGuid',
    'GetDeleted',
    'ItemIDs',
    'Skip',
    'Take',
    'UpdatDate',
    'GetCountDefOptions',
  ],
  [COUNTS]: [
    'DateTimeFromUTC',
    'DateTimeToUTC',
    'BuyerGuid',
    'GetLineDetails',
    'GetCountDefDetails',
  ],
  [ORDERS]: ['DateTimeFromUTC', 'DateTimeToUTC', 'Status', 'BuyerGuid'],
  [TRANSFERS]: ['DateTimeFromUTC', 'DateTimeToUTC', 'BuyerGuid'],
}

type Body = Record<string, unknown>

interface RawItem {
  ID: string
  Name: string
  StorageIDs?: Array<number | string | null>
  StorageNames?: Array<string | null>
  /** The Items output table's shape (the example response uses the arrays). */
  StorageArea1ID?: number | null
  StorageArea1Name?: string | null
  StorageArea2ID?: number | null
  StorageArea2Name?: string | null
}

interface RawCount {
  ID: string
  BuyerGuid: string
  CountDateUTC: string
  Lines: Array<{ LineID: string; ItemID: string; TotalCount: number }>
}

interface Upstream {
  items?: RawItem[]
  /** Items generated on demand for any Skip: a collection that never ends. */
  endlessItems?: boolean
  counts?: RawCount[]
  orders?: Body[]
  transfers?: Body[]
  vendors?: Body[]
  /**
   * `Page.Total` as the collection's row count. The GetInventoryItems example
   * answers `Total: null`, which is the default here; another Skip/Take
   * endpoint's example (GetPreps) reports `Total: 98`.
   */
  reportTotal?: boolean
  /**
   * `Page.Total` as the rows in THIS response: the other reading of that
   * `Total: 98` example, which was answered with exactly 98 rows.
   */
  totalIsPageRows?: boolean
  /** A broken upstream that answers every Skip with the first page. */
  ignoreSkip?: boolean
  /** An upstream that ignores ItemIDs and answers with the first 100 items. */
  ignoreItemIds?: boolean
  /** Calls after this many are answered with the documented quota notice. */
  quotaAfter?: number
  budget?: number
}

function requireInt(path: string, name: string, v: unknown, min: number, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new Error(
      `${path}: ${name} must be an Int in [${min}, ${max}] (got ${JSON.stringify(v)})`,
    )
  }
  return v
}

function requireWindow(path: string, body: Body): void {
  for (const k of ['DateTimeFromUTC', 'DateTimeToUTC']) {
    if (typeof body[k] !== 'string') throw new Error(`${path}: ${k} is required`)
  }
}

function itemsBody(up: Upstream, body: Body): Body {
  const all = up.items ?? []
  if (body['ItemIDs'] !== undefined) {
    if (up.ignoreItemIds) return { Items: all.slice(0, 100), IsSuccess: true }
    const wanted = (body['ItemIDs'] as unknown[]).map(String)
    return { Items: all.filter((i) => wanted.includes(i.ID)), IsSuccess: true }
  }
  // Leaving Take out is not documented to return everything, so no list may
  // rely on it.
  if (body['Take'] === undefined) {
    throw new Error(`${ITEMS}: sent without Take, whose default is undocumented`)
  }
  const take = requireInt(ITEMS, 'Take', body['Take'], 1, MAX_TAKE)
  const skip = body['Skip'] === undefined ? 0 : requireInt(ITEMS, 'Skip', body['Skip'], 0)
  const start = up.ignoreSkip ? 0 : skip
  const rows = up.endlessItems
    ? Array.from({ length: take }, (_, i) => item(start + i))
    : all.slice(start, start + take)
  const total = up.reportTotal ? all.length : up.totalIsPageRows ? rows.length : null
  return {
    Items: rows,
    MaxTakeAllowed: MAX_TAKE,
    Page: { Skip: skip, Take: take, Total: total },
    IsSuccess: true,
    ErrorMessage: null,
  }
}

/**
 * A fake MarketMan at the adapter's HTTP seam (the axios instance its client
 * creates). It honours ONLY each endpoint's documented inputs: an input the
 * docs do not list is refused rather than silently ignored.
 */
function fakeMarketman(up: Upstream) {
  const budget = up.budget ?? CALL_BUDGET
  let calls = 0
  const post = vi.fn(async (path: string, body: Body = {}) => {
    if (++calls > budget) {
      throw new Error(`call budget (${budget}) exceeded: the adapter kept paging`)
    }
    const allowed = DOCUMENTED_INPUTS[path]
    if (!allowed) throw new Error(`undocumented path ${path}`)
    for (const k of Object.keys(body)) {
      if (!allowed.includes(k)) throw new Error(`${path} documents no input ${k}`)
    }
    // MarketMan answers application errors over HTTP 200, in the body.
    if (up.quotaAfter !== undefined && calls > up.quotaAfter) {
      return { status: 200, data: QUOTA_BODY }
    }
    switch (path) {
      case ITEMS:
        return { status: 200, data: itemsBody(up, body) }
      case COUNTS: {
        requireWindow(path, body)
        // "If false, the lines would be null."
        const lines = body['GetLineDetails'] === true
        const counts = (up.counts ?? []).map((c) => ({ ...c, Lines: lines ? c.Lines : null }))
        return { status: 200, data: { InventoryCounts: counts, IsSuccess: true } }
      }
      case ORDERS:
        requireWindow(path, body)
        return { status: 200, data: { Orders: up.orders ?? [], IsSuccess: true } }
      case VENDORS:
        return { status: 200, data: { Vendors: up.vendors ?? [], IsSuccess: true } }
      default:
        requireWindow(path, body)
        // GetTransfers has no saved example response, so this one leaves
        // IsSuccess out: only an explicit `IsSuccess: false` is an error.
        return { status: 200, data: { Transfers: up.transfers ?? [] } }
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ post, get: vi.fn() } as never)
  const bodies = (path: string): Body[] =>
    post.mock.calls.filter((c) => c[0] === path).map((c) => (c[1] ?? {}) as Body)
  return { post, bodies }
}

// ── fixtures ─────────────────────────────────────────────────────────────

function item(i: number, storages?: number[]): RawItem {
  return {
    ID: `item${i + 1}`,
    Name: `Item ${i + 1}`,
    ...(storages
      ? { StorageIDs: storages, StorageNames: storages.map((s) => `Storage ${s}`) }
      : {}),
  }
}

const items = (n: number) => Array.from({ length: n }, (_, i) => item(i))
const itemIds = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => `item${start + i}`)

const adapter = () => new MarketmanAdapter()

/**
 * Drive a list method as the sync worker does: withPageSink({ page, limit })
 * for pages 1..`pages`. `hasMore` is the worker's own reading of each page:
 * the adapter's reported word, else a full page at the size it asked for.
 */
async function walk<T extends { id: string }>(
  list: (params: QueryParams) => Promise<T[]>,
  limit: number,
  pages = 3,
) {
  const seen: string[] = []
  const hasMore: boolean[] = []
  const reported: (boolean | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const rows = await list(params)
    seen.push(...rows.map((r) => r.id))
    const said = readUpstreamPage(params)?.hasMore
    reported.push(said)
    hasMore.push(typeof said === 'boolean' ? said : rows.length >= effectivePageSize(params, limit))
  }
  return { seen, hasMore, reported }
}

/** The API path: parseListQuery, the adapter, then listPage. */
async function apiPages<T extends { id: string }>(
  list: (params: QueryParams) => Promise<T[]>,
  limit: string,
  pages: number,
) {
  const seen: string[] = []
  const metas: ReturnType<typeof listPage>['meta'][] = []
  for (let k = 1; k <= pages; k++) {
    const params = parseListQuery({ page: String(k), limit }, adapter())
    const env = listPage(await list(params), params, 'marketman')
    seen.push(...env.data.map((r) => r.id))
    metas.push(env.meta)
  }
  return { seen, metas }
}

/**
 * Run `fn` with the process in a zone that is not UTC. vitest.config.ts pins
 * TZ=UTC, where reading a zoneless date as local time and as UTC agree, so a
 * date assertion that does not change zone cannot fail on the bug it guards.
 */
async function underTz<T>(tz: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env['TZ']
  process.env['TZ'] = tz
  try {
    return await fn()
  } finally {
    if (prev === undefined) delete process.env['TZ']
    else process.env['TZ'] = prev
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('marketman capabilities', () => {
  it('declares maxPageSize 500: GetInventoryItems Take is "Maximum of 500 at a time"', () => {
    expect(declaredPageMax(adapter())).toBe(MAX_TAKE)
  })
})

// ── listProducts: GetInventoryItems, Skip/Take forwarded ─────────────────

describe('marketman listProducts paging (GetInventoryItems Skip/Take)', () => {
  const call = (params: QueryParams) => adapter().listProducts(CREDS, params)

  it('N = 2L + 1: three worker pages serve every item once, hasMore [true, true, false]', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeMarketman({ items: items(N) })
    const { seen, hasMore, reported } = await walk(call, L)
    expect(seen).toEqual(itemIds(1, N))
    expect(hasMore).toEqual([true, true, false])
    // Total is null, as in the documented example: a full page cannot say
    // whether more follow, and is not claimed to. The short page is the end.
    expect(reported).toEqual([undefined, undefined, false])
  })

  it('page 2 sends Skip = L and Take = L', async () => {
    const { bodies } = fakeMarketman({ items: items(9) })
    await walk(call, 4)
    expect(bodies(ITEMS)).toEqual([
      { BuyerGuid: BUYER, Skip: 0, Take: 4 },
      { BuyerGuid: BUYER, Skip: 4, Take: 4 },
      { BuyerGuid: BUYER, Skip: 8, Take: 4 },
    ])
  })

  it('a numeric Page.Total past the rows served confirms more, and is never reported as a total', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeMarketman({ items: items(N), reportTotal: true })
    const { seen, reported } = await walk(call, L)
    expect(seen).toEqual(itemIds(1, N))
    expect(reported).toEqual([true, true, false])
    const params = withPageSink({ page: 1, limit: L })
    await call(params)
    // Page is in no output table: Total's meaning is undocumented.
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('N = 2L: page 3 is empty and ends the walk', async () => {
    const L = 4
    fakeMarketman({ items: items(2 * L) })
    const { seen, hasMore } = await walk(call, L)
    expect(seen).toEqual(itemIds(1, 2 * L))
    expect(hasMore).toEqual([true, true, false])
  })

  it('N = 2L with Page.Total: Total does not end the full page 2; the empty page 3 does', async () => {
    const L = 4
    fakeMarketman({ items: items(2 * L), reportTotal: true })
    const { seen, hasMore, reported } = await walk(call, L)
    expect(seen).toEqual(itemIds(1, 2 * L))
    expect(reported).toEqual([true, undefined, false])
    expect(hasMore).toEqual([true, true, false])
  })

  it('a Page.Total that counts only this response cannot end a full page', async () => {
    // GetPreps' example answers Total 98 with 98 rows to a request sent
    // without Skip/Take: Total may be this response's row count.
    const L = 4
    const N = 2 * L + 1
    fakeMarketman({ items: items(N), totalIsPageRows: true })
    const { seen, hasMore, reported } = await walk(call, L)
    expect(seen).toEqual(itemIds(1, N))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([undefined, undefined, false])
  })

  it('limit 1 pages one item at a time: Skip 0, 1, 2 at Take 1', async () => {
    const { bodies } = fakeMarketman({ items: items(3) })
    const { seen, hasMore } = await walk(call, 1, 4)
    expect(seen).toEqual(itemIds(1, 3))
    expect(hasMore).toEqual([true, true, true, false])
    expect(bodies(ITEMS).map((b) => [b['Skip'], b['Take']])).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ])
  })

  it('a fractional direct limit is floored: Take and Skip stay whole numbers', async () => {
    const { bodies } = fakeMarketman({ items: items(9) })
    const rows = await call(withPageSink({ page: 2, limit: 4.5 }))
    expect(rows.map((p) => p.id)).toEqual(itemIds(5, 4))
    expect(bodies(ITEMS)).toEqual([{ BuyerGuid: BUYER, Skip: 4, Take: 4 }])
  })

  it('a direct limit above 500 is clamped to Take 500, reported as the page size, and serves every item', async () => {
    const { bodies } = fakeMarketman({ items: items(1001) })
    const { seen, hasMore } = await walk(call, 1000)
    expect(seen).toEqual(itemIds(1, 1001))
    expect(hasMore).toEqual([true, true, false])
    expect(bodies(ITEMS).map((b) => [b['Skip'], b['Take']])).toEqual([
      [0, 500],
      [500, 500],
      [1000, 500],
    ])
    const params = withPageSink({ page: 1, limit: 1000 })
    await call(params)
    expect(readUpstreamPage(params)?.pageSize).toBe(MAX_TAKE)
  })

  it('a router limit above 500 is capped at the declared 500, and every item is still served', async () => {
    const { bodies } = fakeMarketman({ items: items(1001), reportTotal: true })
    const { seen, metas } = await apiPages(call, '100000', 3)
    expect(seen).toEqual(itemIds(1, 1001))
    expect(metas.map((m) => [m.limit, m.hasMore])).toEqual([
      [500, true],
      [500, true],
      [500, false],
    ])
    expect(bodies(ITEMS).map((b) => b['Take'])).toEqual([500, 500, 500])
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    const { bodies } = fakeMarketman({ items: items(15) })
    const seen: string[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k), limit: '7' }, adapter())
      expect(params.limit).toBe(7)
      seen.push(...(await call(params)).map((p) => p.id))
    }
    expect(seen).toEqual(itemIds(1, 15))
    expect(bodies(ITEMS).map((b) => b['Skip'])).toEqual([0, 7, 14])
  })

  it('API path: parseListQuery + listPage publishes the right meta.hasMore', async () => {
    fakeMarketman({ items: items(9) })
    const { seen, metas } = await apiPages(call, '4', 3)
    expect(seen).toEqual(itemIds(1, 9))
    // Total null: a full page is honestly undecidable; the short page ends it.
    expect(metas.map((m) => m.hasMore)).toEqual([null, null, false])
  })

  it('API path with Page.Total: meta.hasMore is exact, and no total is claimed', async () => {
    fakeMarketman({ items: items(9), reportTotal: true })
    const { metas } = await apiPages(call, '4', 3)
    expect(metas.map((m) => [m.page, m.hasMore, m.totalCount])).toEqual([
      [1, true, null],
      [2, true, null],
      [3, false, null],
    ])
  })

  it('a direct call with no limit asks for the default page from the start', async () => {
    const { bodies } = fakeMarketman({ items: items(3) })
    expect((await call({})).map((p) => p.id)).toEqual(itemIds(1, 3))
    expect(bodies(ITEMS)).toEqual([{ BuyerGuid: BUYER, Skip: 0, Take: 100 }])
  })

  it('getProduct fetches the one item through the documented ItemIDs filter', async () => {
    const { bodies } = fakeMarketman({ items: items(1200) })
    expect((await adapter().getProduct(CREDS, 'item1100')).id).toBe('item1100')
    expect(bodies(ITEMS)).toEqual([{ BuyerGuid: BUYER, ItemIDs: ['item1100'] }])
  })

  it('getProduct returns the asked-for item, not the first, if ItemIDs is not honoured', async () => {
    // ItemIDs is documented only as "List"; its element type is not.
    fakeMarketman({ items: items(200), ignoreItemIds: true })
    expect((await adapter().getProduct(CREDS, 'item37')).id).toBe('item37')
  })

  it('getProduct rejects an id the platform does not return', async () => {
    fakeMarketman({ items: items(5) })
    await expect(adapter().getProduct(CREDS, 'item99')).rejects.toThrow(/item99 not found/)
  })
})

// ── listLocations: storage areas from every item page, sliced ────────────

/**
 * `n` items. Item i carries storage area 1001 + ⌊i / 100⌋, and every item
 * from the second upstream page on also carries 1001, already seen on the
 * first, so de-duplication has to span upstream pages.
 */
function storageItems(n: number): RawItem[] {
  return Array.from({ length: n }, (_, i) => {
    const own = 1001 + Math.floor(i / 100)
    return item(i, i >= MAX_TAKE ? [own, 1001] : [own])
  })
}
const storageIds = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => String(1000 + start + i))

describe('marketman listLocations paging (storage areas derived from GetInventoryItems)', () => {
  const call = (params: QueryParams) => adapter().listLocations(CREDS, params)

  it('N = 2L + 1: three worker pages serve every storage area once, hasMore [true, true, false]', async () => {
    // 1,100 items over three upstream pages hold 11 storage areas.
    const L = 5
    fakeMarketman({ items: storageItems(1100) })
    const { seen, hasMore, reported } = await walk(call, L)
    expect(seen).toEqual(storageIds(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
  })

  it('walks every item page at Take 500, Skip += 500, until a short page', async () => {
    const { bodies } = fakeMarketman({ items: storageItems(1100) })
    await call(withPageSink({ page: 2, limit: 5 }))
    expect(bodies(ITEMS)).toEqual([
      { BuyerGuid: BUYER, Skip: 0, Take: 500 },
      { BuyerGuid: BUYER, Skip: 500, Take: 500 },
      { BuyerGuid: BUYER, Skip: 1000, Take: 500 },
    ])
  })

  it('reports the whole set as totalCount and marks the page as paged locally', async () => {
    fakeMarketman({ items: storageItems(1100) })
    const params = withPageSink({ page: 1, limit: 5 })
    await call(params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 11, hasMore: true, pagedLocally: true })
  })

  it('N = 2L: page 2 ends the set and page 3 is empty', async () => {
    const L = 5
    fakeMarketman({ items: storageItems(1000) })
    const { seen, hasMore } = await walk(call, L)
    expect(seen).toEqual(storageIds(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('without Page.Total an exact multiple of 500 items costs one empty read to end', async () => {
    const { bodies } = fakeMarketman({ items: storageItems(1000) })
    await call(withPageSink({ page: 1, limit: 5 }))
    expect(bodies(ITEMS).map((b) => b['Skip'])).toEqual([0, 500, 1000])
  })

  it('Page.Total does not stop the walk: only a short page does', async () => {
    const { bodies } = fakeMarketman({ items: storageItems(1000), reportTotal: true })
    expect(await call(withPageSink({ page: 1, limit: 50 }))).toHaveLength(10)
    expect(bodies(ITEMS).map((b) => b['Skip'])).toEqual([0, 500, 1000])
  })

  it('a Page.Total that counts only this response does not cut the walk at the first page', async () => {
    const { bodies } = fakeMarketman({ items: storageItems(1100), totalIsPageRows: true })
    const { seen } = await apiPages(call, '100', 1)
    expect(seen).toEqual(storageIds(1, 11))
    expect(bodies(ITEMS).map((b) => b['Skip'])).toEqual([0, 500, 1000])
  })

  it('a limit above 500 still serves every storage area once', async () => {
    fakeMarketman({ items: storageItems(1100) })
    const { seen, metas } = await apiPages(call, '100000', 2)
    expect(seen).toEqual(storageIds(1, 11))
    expect(metas.map((m) => [m.limit, m.hasMore])).toEqual([
      [500, false],
      [500, false],
    ])
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    fakeMarketman({ items: storageItems(1100) })
    const { seen, metas } = await apiPages(call, '4', 3)
    expect(seen).toEqual(storageIds(1, 11))
    expect(metas.map((m) => m.limit)).toEqual([4, 4, 4])
  })

  it('API path: parseListQuery + listPage publishes an exact meta.hasMore and totalCount', async () => {
    fakeMarketman({ items: storageItems(1100) })
    const { metas } = await apiPages(call, '5', 3)
    expect(metas.map((m) => [m.page, m.hasMore, m.totalCount])).toEqual([
      [1, true, 11],
      [2, true, 11],
      [3, false, 11],
    ])
  })

  it('getLocation finds a storage area that appears only past the first item page', async () => {
    fakeMarketman({ items: storageItems(1100) })
    expect((await adapter().getLocation(CREDS, '1011')).id).toBe('1011')
  })

  it('getLocation finds the 150th of 150 storage areas: past any default page', async () => {
    fakeMarketman({ items: Array.from({ length: 150 }, (_, i) => item(i, [1001 + i])) })
    expect((await adapter().getLocation(CREDS, '1150')).id).toBe('1150')
  })

  it('reads the Items table shape too: StorageArea1ID/Name and StorageArea2ID/Name', async () => {
    fakeMarketman({
      items: [
        {
          ID: 'a',
          Name: 'A',
          StorageArea1ID: 7,
          StorageArea1Name: 'Dry store',
          StorageArea2ID: 8,
          StorageArea2Name: 'Freezer',
        },
        {
          ID: 'b',
          Name: 'B',
          StorageArea1ID: 9,
          StorageArea1Name: 'Bar',
          StorageArea2ID: null,
          StorageArea2Name: null,
        },
      ],
    })
    const locations = await call(withPageSink({ page: 1, limit: 10 }))
    expect(locations.map((l) => [l.id, l.name])).toEqual([
      ['7', 'Dry store'],
      ['8', 'Freezer'],
      ['9', 'Bar'],
    ])
  })

  it('keeps the first name seen for an area, skips empty ids, and tags the requested buyer', async () => {
    fakeMarketman({
      items: [
        {
          ID: 'a',
          Name: 'A',
          StorageIDs: [7, '', null],
          StorageNames: ['Walk-in', 'Blank', 'Null'],
        },
        { ID: 'b', Name: 'B', StorageIDs: [7, 8], StorageNames: ['Walk-in (renamed)', 'Freezer'] },
      ],
    })
    const locations = await call(withPageSink({ page: 1, limit: 10 }))
    expect(locations.map((l) => [l.id, l.name])).toEqual([
      ['7', 'Walk-in'],
      ['8', 'Freezer'],
    ])
    // Items document no buyer field; the area belongs to the buyer asked about.
    expect(locations.map((l) => l.metadata?.['buyerGuid'])).toEqual([BUYER, BUYER])
  })

  it('an upstream that ignores Skip fails loudly on the repeated page instead of looping', async () => {
    const { post } = fakeMarketman({ items: storageItems(1100), ignoreSkip: true })
    await expect(call(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/Skip/)
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('an item list that never ends fails within 100 reads, a fifth of the 500-call daily quota', async () => {
    const { post } = fakeMarketman({ endlessItems: true, budget: 1000 })
    await expect(call(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/within 100 pages/)
    expect(post.mock.calls.length).toBeLessThanOrEqual(100)
  })
})

// ── whole-window lists: GetInventoryCounts, GetOrdersBySentDate, GetTransfers

interface WindowCase {
  name: string
  path: string
  /** The request's keys: the documented inputs the adapter sends. */
  keys: string[]
  /** Upstream holding exactly `n` rows of this resource. */
  upstream: (n: number) => Upstream
  ids: (start: number, count: number) => string[]
  list: (params: QueryParams) => Promise<Array<{ id: string }>>
  /** The resource's get-by-id, where it has one. */
  get?: (id: string) => Promise<{ id: string }>
}

/** A count date in the documented wire format, "yyyy/mm/dd hh:mm:ss" (UTC). */
const COUNT_DATE = '2023/01/09 11:19:30'

/** Counts of three lines each, `n` lines in all. */
function countsWithLines(n: number): RawCount[] {
  const counts: RawCount[] = []
  for (let j = 0; j < n; j++) {
    const c = Math.floor(j / 3)
    counts[c] ??= {
      ID: `count${c + 1}`,
      BuyerGuid: BUYER,
      CountDateUTC: COUNT_DATE,
      Lines: [],
    }
    counts[c]!.Lines.push({ LineID: `line${j + 1}`, ItemID: `item${j + 1}`, TotalCount: j + 1 })
  }
  return counts
}

const counts = (n: number): RawCount[] =>
  Array.from({ length: n }, (_, i) => ({
    ID: `count${i + 1}`,
    BuyerGuid: BUYER,
    CountDateUTC: COUNT_DATE,
    Lines: [{ LineID: `line${i + 1}`, ItemID: `item${i + 1}`, TotalCount: 1 }],
  }))

const WINDOW_KEYS = ['BuyerGuid', 'DateTimeFromUTC', 'DateTimeToUTC']

const seq =
  (prefix: string, suffix = '') =>
  (start: number, count: number) =>
    Array.from({ length: count }, (_, i) => `${prefix}${start + i}${suffix}`)

const WINDOW_CASES: WindowCase[] = [
  {
    name: 'listStockLevels (GetInventoryCounts lines)',
    path: COUNTS,
    keys: [...WINDOW_KEYS, 'GetLineDetails'],
    upstream: (n) => ({ counts: countsWithLines(n) }),
    // id = `${ItemID}:${BuyerGuid}:${CountID}`; line j sits in count ⌈j / 3⌉.
    ids: (start, count) =>
      Array.from({ length: count }, (_, i) => {
        const j = start + i
        return `item${j}:${BUYER}:count${Math.ceil(j / 3)}`
      }),
    list: (params) => adapter().listStockLevels(CREDS, params),
  },
  {
    name: 'listStockAdjustments (GetInventoryCounts)',
    path: COUNTS,
    keys: [...WINDOW_KEYS, 'GetLineDetails'],
    upstream: (n) => ({ counts: counts(n) }),
    ids: seq('count'),
    list: (params) => adapter().listStockAdjustments(CREDS, params),
    get: (id) => adapter().getStockAdjustment(CREDS, id),
  },
  {
    name: 'listPurchaseOrders (GetOrdersBySentDate)',
    path: ORDERS,
    keys: WINDOW_KEYS,
    upstream: (n) => ({
      orders: Array.from({ length: n }, (_, i) => ({ OrderNumber: `PO-${i + 1}` })),
    }),
    ids: seq('PO-'),
    list: (params) => adapter().listPurchaseOrders(CREDS, params),
    get: (id) => adapter().getPurchaseOrder(CREDS, id),
  },
  {
    name: 'listStockTransfers (GetTransfers)',
    path: TRANSFERS,
    keys: WINDOW_KEYS,
    upstream: (n) => ({
      transfers: Array.from({ length: n }, (_, i) => ({ ID: `tr${i + 1}` })),
    }),
    ids: seq('tr'),
    list: (params) => adapter().listStockTransfers(CREDS, params),
    get: (id) => adapter().getStockTransfer(CREDS, id),
  },
  {
    // "Gets all vendors your account is connected to": no paging input.
    name: 'listSuppliers (GetVendors)',
    path: VENDORS,
    keys: ['BuyerGuid'],
    upstream: (n) => ({
      vendors: Array.from({ length: n }, (_, i) => ({
        Name: `V ${i + 1}`,
        Guid: `v${i + 1}`,
        TaxLevelID: 1,
      })),
    }),
    ids: seq('v'),
    list: (params) => adapter().listSuppliers(CREDS, params),
    get: (id) => adapter().getSupplier(CREDS, id),
  },
]

describe.each(WINDOW_CASES)('marketman $name paging (whole response, sliced)', (c) => {
  it('N = 2L + 1: three worker pages serve every row once, hasMore [true, true, false]', async () => {
    const L = 4
    const N = 2 * L + 1
    fakeMarketman(c.upstream(N))
    const { seen, hasMore, reported } = await walk(c.list, L)
    expect(seen).toEqual(c.ids(1, N))
    expect(hasMore).toEqual([true, true, false])
    expect(reported).toEqual([true, true, false])
  })

  it('page 2 is page 2, from the same documented request as page 1', async () => {
    const { bodies } = fakeMarketman(c.upstream(9))
    const params = withPageSink({ page: 2, limit: 4 })
    expect((await c.list(params)).map((r) => r.id)).toEqual(c.ids(5, 4))
    await c.list(withPageSink({ page: 1, limit: 4 }))
    const [page2, page1] = bodies(c.path)
    expect(page2).toEqual(page1)
    expect(Object.keys(page2!).sort()).toEqual([...c.keys].sort())
  })

  it('reports the whole window as totalCount and marks the page as paged locally', async () => {
    fakeMarketman(c.upstream(9))
    const params = withPageSink({ page: 1, limit: 4 })
    await c.list(params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
  })

  it('N = 2L: page 2 ends the collection and page 3 is empty', async () => {
    const L = 4
    fakeMarketman(c.upstream(2 * L))
    const { seen, hasMore } = await walk(c.list, L)
    expect(seen).toEqual(c.ids(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('a limit above 500 is capped at the declared 500, and every row is still served', async () => {
    fakeMarketman(c.upstream(1001))
    const { seen, metas } = await apiPages(c.list, '100000', 3)
    expect(seen).toEqual(c.ids(1, 1001))
    expect(metas.map((m) => [m.limit, m.hasMore])).toEqual([
      [500, true],
      [500, true],
      [500, false],
    ])
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    fakeMarketman(c.upstream(15))
    const { seen, metas } = await apiPages(c.list, '7', 3)
    expect(seen).toEqual(c.ids(1, 15))
    expect(metas.map((m) => m.limit)).toEqual([7, 7, 7])
  })

  it('API path: parseListQuery + listPage publishes an exact meta.hasMore and totalCount', async () => {
    fakeMarketman(c.upstream(8))
    const { metas } = await apiPages(c.list, '4', 3)
    expect(metas.map((m) => [m.page, m.hasMore, m.totalCount])).toEqual([
      [1, true, 8],
      [2, false, 8],
      [3, false, 8],
    ])
  })

  it('a direct call with no limit gets every row', async () => {
    fakeMarketman(c.upstream(9))
    expect((await c.list({})).map((r) => r.id)).toEqual(c.ids(1, 9))
  })

  it('a quota notice (HTTP 200, IsSuccess false) fails the page instead of ending the list', async () => {
    fakeMarketman({ ...c.upstream(9), quotaAfter: 0 })
    const params = withPageSink({ page: 1, limit: 4 })
    await expect(c.list(params)).rejects.toThrow(/Reached max calls/)
    // Nothing reported: no total of 0, no hasMore false for a cache to trust.
    expect(readUpstreamPage(params)).toBeUndefined()
  })
})

/** getStockLevel is bulk-only (it throws), so stock levels have no case here. */
const GET_CASES = WINDOW_CASES.flatMap((c) => (c.get ? [{ ...c, get: c.get }] : []))

describe.each(GET_CASES)('marketman $name get-by-id', (c) => {
  it('finds the 150th of 150 rows: its list call must not be limited to a default page', async () => {
    fakeMarketman(c.upstream(150))
    const [last] = c.ids(150, 1)
    expect((await c.get(last!)).id).toBe(last)
  })
})

describe('marketman listSuppliers slices the vendors it serves', () => {
  it('pages over the kept vendors, so pages stay full and the total counts only them', async () => {
    // Every third vendor has no Guid and is dropped: 12 upstream, 8 served.
    fakeMarketman({
      vendors: Array.from({ length: 12 }, (_, i) =>
        i % 3 === 2 ? { Name: `nameless ${i + 1}` } : { Guid: `v${i + 1}`, Name: `V ${i + 1}` },
      ),
    })
    const call = (params: QueryParams) => adapter().listSuppliers(CREDS, params)
    const { seen, hasMore } = await walk(call, 4)
    expect(seen).toEqual(['v1', 'v2', 'v4', 'v5', 'v7', 'v8', 'v10', 'v11'])
    expect(hasMore).toEqual([true, false, false])
    const params = withPageSink({ page: 1, limit: 4 })
    await call(params)
    expect(readUpstreamPage(params)?.totalCount).toBe(8)
  })
})

describe('marketman listSuppliers reads the documented GetVendors', () => {
  it('posts BuyerGuid, and nothing else, to /buyers/items/GetVendors', async () => {
    const { post, bodies } = fakeMarketman({
      vendors: [{ Name: 'My 2nd Vendor', Guid: '444', TaxLevelID: 1 }],
    })
    const rows = await adapter().listSuppliers(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(post.mock.calls.map((c) => c[0])).toEqual([VENDORS])
    expect(bodies(VENDORS)).toEqual([{ BuyerGuid: BUYER }])
    expect(rows.map((r) => [r.id, r.name])).toEqual([['444', 'My 2nd Vendor']])
  })

  it('keeps vendors in the documented shape (Guid/Name), not only the undocumented VendorGuid', async () => {
    fakeMarketman({
      vendors: [
        { Name: 'documented', Guid: 'g1' },
        { VendorName: 'undocumented', VendorGuid: 'g2' },
      ],
    })
    const rows = await adapter().listSuppliers(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['g1'])
  })

  it('refuses with 501 NOT_SUPPORTED, sending nothing, when the connection has no Buyer GUID', async () => {
    // "BuyerGuid: put the buyer GUID that you wish to work on (for working on
    // Buyer API)": GetVendors lists one buyer's vendors, named by BuyerGuid.
    const { post } = fakeMarketman({ vendors: [{ Name: 'My 2nd Vendor', Guid: '444' }] })
    for (const extra of [{}, { buyerGuid: '' }]) {
      const creds = { accessToken: 'mm_test', extra }
      await expect(
        adapter().listSuppliers(creds, withPageSink({ page: 1, limit: 10 })),
      ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      await expect(adapter().getSupplier(creds, '444')).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
        message: expect.stringMatching(/Buyer GUID/),
      })
    }
    expect(post).not.toHaveBeenCalled()
  })

  it('getSupplier reads back an id listSuppliers returned', async () => {
    fakeMarketman({ vendors: [{ Name: ' My Vendor ', Guid: 'adfef1a111b09ab396c2d323f3' }] })
    const s = await adapter().getSupplier(CREDS, 'adfef1a111b09ab396c2d323f3')
    expect(s.name).toBe(' My Vendor ')
  })
})

describe('marketman inventory counts carry their lines and dates', () => {
  it('asks GetInventoryCounts for its lines, which are null by default', async () => {
    const { bodies } = fakeMarketman({ counts: countsWithLines(3) })
    const levels = await adapter().listStockLevels(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(levels).toHaveLength(3)
    expect(bodies(COUNTS)[0]?.['GetLineDetails']).toBe(true)
  })

  it('reads the count date from the documented CountDateUTC, as UTC on a host that is not', async () => {
    // "When receiving date value from the server, it should be parsed as
    // yyyy/mm/dd hh:mm:ss": no zone, so a host-local read shifts it.
    fakeMarketman({ counts: countsWithLines(1) })
    await underTz('America/New_York', async () => {
      const [level] = await adapter().listStockLevels(CREDS, withPageSink({ page: 1, limit: 10 }))
      expect(level?.lastCountedAt).toBe('2023-01-09T11:19:30.000Z')
      const [adjustment] = await adapter().listStockAdjustments(
        CREDS,
        withPageSink({ page: 1, limit: 10 }),
      )
      expect(adjustment?.adjustedAt).toBe('2023-01-09T11:19:30.000Z')
      expect(adjustment?.lines).toHaveLength(1)
    })
  })
})

// ── the date window ──────────────────────────────────────────────────────

describe('marketman date window (GetInventoryCounts, GetOrdersBySentDate, GetTransfers)', () => {
  const windowOf = async (at: string) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(at))
    const { bodies } = fakeMarketman({ orders: [] })
    await adapter().listPurchaseOrders(CREDS, withPageSink({ page: 1, limit: 10 }))
    vi.restoreAllMocks()
    const [body] = bodies(ORDERS)
    return [body?.['DateTimeFromUTC'], body?.['DateTimeToUTC']]
  }

  it('includes today: it ends at 00:00 UTC tomorrow, in the documented format', async () => {
    expect(await windowOf('2026-09-23T15:04:05Z')).toEqual([
      '2026/06/25 00:00:00',
      '2026/09/24 00:00:00',
    ])
  })

  it('holds still through the UTC day, so one caller page slices the same rows as the next', async () => {
    const early = await windowOf('2026-09-23T00:00:01Z')
    expect(await windowOf('2026-09-23T23:59:59Z')).toEqual(early)
  })
})

// ── errors: HTTP 200, IsSuccess false ────────────────────────────────────

describe('marketman IsSuccess false (errors arrive as HTTP 200 in the body)', () => {
  it('a quota notice on item page 2 fails listLocations instead of serving page 1 as the whole set', async () => {
    fakeMarketman({ items: storageItems(1100), quotaAfter: 1 })
    const params = withPageSink({ page: 1, limit: 5 })
    await expect(adapter().listLocations(CREDS, params)).rejects.toThrow(/Reached max calls/)
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('a quota notice fails the products page instead of reading as its end', async () => {
    fakeMarketman({ items: items(9), quotaAfter: 1 })
    await adapter().listProducts(CREDS, withPageSink({ page: 1, limit: 4 }))
    const params = withPageSink({ page: 2, limit: 4 })
    await expect(adapter().listProducts(CREDS, params)).rejects.toThrow(/Reached max calls/)
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('a quota notice fails getProduct rather than reading as not found', async () => {
    fakeMarketman({ items: items(9), quotaAfter: 0 })
    await expect(adapter().getProduct(CREDS, 'item1')).rejects.toThrow(/Reached max calls/)
  })

  it('reaches the API caller as 502 UPSTREAM_ERROR with the platform message, not 500', async () => {
    fakeMarketman({ items: items(9), quotaAfter: 0 })
    const app = Fastify({ logger: false })
    attachAdapterErrorHandler(app)
    app.get('/products', async () =>
      adapter().listProducts(CREDS, withPageSink({ page: 1, limit: 4 })),
    )
    await app.ready()
    const res = await app.inject({ method: 'GET', url: '/products' })
    await app.close()
    expect(res.statusCode).toBe(502)
    const body = JSON.parse(res.payload)
    expect(body.error.code).toBe('UPSTREAM_ERROR')
    expect(body.error.upstreamBody).toContain('Reached max calls')
  })
})
