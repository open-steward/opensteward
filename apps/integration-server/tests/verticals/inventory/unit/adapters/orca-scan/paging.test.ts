/**
 * Orca Scan list paging. Nothing in Orca Scan's API pages, so the adapter
 * serves the caller's pages itself.
 *
 * Orca Scan's own OpenAPI spec (https://api.orcascan.com/v1/openapi.json,
 * linked from its REST API guide) declares NO parameters on GET /sheets
 * (operationId listSheets, "List all sheets"), whose 200 response is "Object
 * containing a data array of sheets the authenticated user can access". GET
 * /sheets/{sheetId}/rows (listRows) takes only `barcode` and `withTitles`, and
 * the guide says "GET /sheets/:sheetId/rows = get all rows". No operation in
 * the spec declares a page, limit, skip, offset or cursor parameter, and no
 * maximum page size is documented, so the adapter declares none.
 *
 * - listLocations slices the whole sheet list (`pageLocally`).
 * - listProducts and listStockLevels flatten every sheet's rows. Each sheet is
 *   one upstream page of `pageByRows`, which cuts exactly the caller's rows.
 *
 * Before the fix every list returned the whole collection for every page: the
 * router truncated to `limit`, page 2 repeated page 1, and rows past the first
 * page were unreachable. On the sync path, page 2 equal to page 1 makes the
 * worker throw, so products and stock levels could not sync at 500+ rows.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  declaredPageMax,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { OrcaScanAdapter } from '../../../../../../src/verticals/inventory/adapters/orca-scan/index'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'

/** Upstream reads one case may make. A loop that keeps paging fails by name. */
const DEFAULT_BUDGET = 40

// ── fixtures ────────────────────────────────────────────────────────────────

interface Row {
  _id: string
  barcode: string
  name: string
  quantity: number
}
interface Sheet {
  _id: string
  name: string
  createdAt: string
  rows: Row[]
}

/**
 * An id shaped like Orca Scan's (24 hex digits, as in its guide's examples:
 * `62a3188f098a6343fe0d9c1b`), sorting in creation order. `n` is 1-based.
 */
function oid(prefix: string, n: number): string {
  return prefix + n.toString(16).padStart(24 - prefix.length, '0')
}

/** Account A's ids; account B's differ in every id, so a mix-up shows. */
const A = { sheet: '62a3188f', row: '62b8abeb' }
const B = { sheet: '70000000', row: '71111111' }

/**
 * An account whose sheet k (1-based) holds `sizes[k - 1]` rows. Rows are
 * numbered across the whole account in sheet order, so row ids ascend within
 * each sheet and the expected stream is simply rows 1..N.
 */
function account(sizes: number[], ns = A): Sheet[] {
  let n = 0
  return sizes.map((size, i) => ({
    _id: oid(ns.sheet, i + 1),
    name: `Sheet ${i + 1}`,
    createdAt: '2024-03-01T00:00:00Z',
    rows: Array.from({ length: size }, () => {
      n++
      return { _id: oid(ns.row, n), barcode: `BC${n}`, name: `Item ${n}`, quantity: n }
    }),
  }))
}

const sheetIds = (sheets: Sheet[]) => sheets.map((s) => s._id)
const productIds = (sheets: Sheet[]) => sheets.flatMap((s) => s.rows.map((r) => r._id))
const stockLevelIds = (sheets: Sheet[]) =>
  sheets.flatMap((s) => s.rows.map((r) => `${r._id}:${s._id}`))

// ── fake Orca Scan ──────────────────────────────────────────────────────────

interface Call {
  token: string
  path: string
  params: Record<string, unknown>
}

/**
 * A fake Orca Scan at the axios.create seam that honours ONLY what the spec
 * documents: GET /sheets takes no parameters, and GET /sheets/{id}/rows is
 * sent exactly `withTitles: false` by this adapter. Anything else is refused,
 * not ignored. Each answers with the whole collection in `{ data: [...] }`.
 *
 * Accounts are chosen by the bearer token, as Orca Scan does. With `shuffle`,
 * every response lists its sheets or rows in a different order, which the
 * spec does not rule out. `accounts` may be changed between calls to model
 * sheets added or deleted.
 */
function fakeOrca(
  accounts: Record<string, Sheet[]>,
  opts: { budget?: number; shuffle?: boolean; sheetsBody?: unknown; rowsBody?: unknown } = {},
) {
  const budget = opts.budget ?? DEFAULT_BUDGET
  const calls: Call[] = []
  const order = <T>(items: T[]): T[] => {
    if (!opts.shuffle || items.length < 2) return [...items]
    const k = calls.length % items.length
    const rotated = [...items.slice(k), ...items.slice(0, k)]
    return calls.length % 2 ? rotated.reverse() : rotated
  }
  const getFor = (token: string) =>
    vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = cfg?.params ?? {}
      calls.push({ token, path, params })
      if (calls.length > budget)
        throw new Error(`call budget (${budget}) exceeded: the adapter kept paging`)
      const sheets = accounts[token]
      if (!sheets) throw Object.assign(new Error('401'), { response: { status: 401 } })
      if (path === '/sheets') {
        if (Object.keys(params).length > 0) {
          throw new Error(`GET /sheets takes no parameters (got ${JSON.stringify(params)})`)
        }
        if (opts.sheetsBody !== undefined) return { data: opts.sheetsBody }
        return { data: { data: order(sheets.map(({ rows: _rows, ...s }) => s)) } }
      }
      const m = /^\/sheets\/([^/]+)\/rows$/.exec(path)
      if (m) {
        if (JSON.stringify(params) !== JSON.stringify({ withTitles: false })) {
          throw new Error(
            `GET ${path} is sent only withTitles=false (got ${JSON.stringify(params)})`,
          )
        }
        const sheet = sheets.find((s) => s._id === m[1])
        if (!sheet) throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
        if (opts.rowsBody !== undefined) return { data: opts.rowsBody }
        return { data: { data: order(sheet.rows) } }
      }
      throw new Error(`unexpected path ${path}`)
    })
  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers: { Authorization: string } }) => ({
    get: getFor(cfg.headers.Authorization.replace(/^Bearer /, '')),
    post: vi.fn(),
  })) as never)
  const rowReads = (token = 'tokA') =>
    calls.filter((c) => c.token === token && c.path.endsWith('/rows')).map((c) => c.path)
  const sheetReads = (token = 'tokA') =>
    calls.filter((c) => c.token === token && c.path === '/sheets').length
  return { calls, rowReads, sheetReads }
}

// ── driving the adapter ─────────────────────────────────────────────────────

const CREDS_A = { accessToken: 'tokA' }
const CREDS_B = { accessToken: 'tokB' }

/** The adapter as the router holds it, which is what it hands parseListQuery. */
const routed = (a: OrcaScanAdapter): InventoryAdapter => a

type ListMethod = 'listLocations' | 'listProducts' | 'listStockLevels'

function list(
  a: OrcaScanAdapter,
  method: ListMethod,
  params: QueryParams,
  creds = CREDS_A,
): Promise<{ id: string }[]> {
  return a[method](creds, params)
}

/**
 * Drive a method as the sync worker does, withPageSink({ page, limit }) for
 * pages 1..`pages`, on ONE adapter instance: in production AdapterRegistry
 * keeps one instance per slug, shared by every connection and page.
 */
async function walk(
  a: OrcaScanAdapter,
  method: ListMethod,
  limit: number,
  pages: number,
  opts: {
    creds?: { accessToken: string }
    filter?: Record<string, string>
    between?: () => void
  } = {},
) {
  const seen: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    if (k > 1) opts.between?.()
    const params = withPageSink({ page: k, limit, ...(opts.filter ? { filter: opts.filter } : {}) })
    seen.push(...(await list(a, method, params, opts.creds)).map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore }
}

/** The same walk through the API path: parseListQuery, then listPage's envelope. */
async function apiWalk(a: OrcaScanAdapter, method: ListMethod, limit: string, pages: number) {
  const seen: string[] = []
  const hasMore: (boolean | null)[] = []
  const limits: number[] = []
  for (let k = 1; k <= pages; k++) {
    const params = parseListQuery({ page: String(k), limit }, routed(a))
    const env = listPage(await list(a, method, params), params, 'orca-scan')
    limits.push(env.meta.limit)
    seen.push(...env.data.map((r) => r.id))
    hasMore.push(env.meta.hasMore)
  }
  return { seen, hasMore, limits }
}

beforeEach(() => _resetRowPager())
afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe('orca-scan capabilities', () => {
  it('declares no maxPageSize: Orca Scan documents no page size or maximum', () => {
    expect(declaredPageMax(routed(new OrcaScanAdapter()))).toBeUndefined()
  })
})

// ── listLocations: GET /sheets, sliced locally ──────────────────────────────

describe('orca-scan listLocations paging (GET /sheets, unpaginated)', () => {
  const sheetsOf = (n: number, ns = A) =>
    account(
      Array.from({ length: n }, () => 0),
      ns,
    )

  it('N = 2L + 1: three worker pages serve every sheet once, hasMore [true, true, false]', async () => {
    const L = 4
    const sheets = sheetsOf(2 * L + 1)
    fakeOrca({ tokA: sheets })
    const { seen, hasMore } = await walk(new OrcaScanAdapter(), 'listLocations', L, 3)
    expect(seen).toEqual(sheetIds(sheets))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 is page 2: sheets L+1..2L, not a repeat of page 1', async () => {
    const sheets = sheetsOf(9)
    fakeOrca({ tokA: sheets })
    const got = await list(
      new OrcaScanAdapter(),
      'listLocations',
      withPageSink({ page: 2, limit: 4 }),
    )
    expect(got.map((l) => l.id)).toEqual(sheetIds(sheets).slice(4, 8))
  })

  it('every page sends the same bare GET /sheets: the spec documents no paging parameter', async () => {
    const { calls } = fakeOrca({ tokA: sheetsOf(9) })
    await walk(new OrcaScanAdapter(), 'listLocations', 4, 3)
    expect(calls).toEqual(
      Array.from({ length: 3 }, () => ({ token: 'tokA', path: '/sheets', params: {} })),
    )
  })

  it('reports the whole collection as totalCount and marks the page as paged locally', async () => {
    fakeOrca({ tokA: sheetsOf(9) })
    const params = withPageSink({ page: 1, limit: 4 })
    await list(new OrcaScanAdapter(), 'listLocations', params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 9, hasMore: true, pagedLocally: true })
  })

  it('N = 2L: page 2 ends the collection and page 3 is empty', async () => {
    const L = 4
    const sheets = sheetsOf(2 * L)
    fakeOrca({ tokA: sheets })
    const { seen, hasMore } = await walk(new OrcaScanAdapter(), 'listLocations', L, 3)
    expect(seen).toEqual(sheetIds(sheets))
    expect(hasMore).toEqual([true, false, false])
  })

  it('walks every sheet at the worker limit of 500 (no declared max)', async () => {
    // With no maxPageSize the worker pages at its own ceiling of 500.
    const sheets = sheetsOf(1200)
    fakeOrca({ tokA: sheets })
    const { seen, hasMore } = await walk(new OrcaScanAdapter(), 'listLocations', 500, 3)
    expect(seen).toEqual(sheetIds(sheets))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a limit above the router cap (500) is clamped, and every sheet is still served once', async () => {
    // Orca Scan documents no maximum, so the only clamp is parseListQuery's.
    const sheets = sheetsOf(1001)
    fakeOrca({ tokA: sheets })
    const { seen, hasMore, limits } = await apiWalk(
      new OrcaScanAdapter(),
      'listLocations',
      '100000',
      3,
    )
    expect(limits).toEqual([500, 500, 500])
    expect(seen).toEqual(sheetIds(sheets))
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks with the limit exactly as parseListQuery delivers it', async () => {
    const sheets = sheetsOf(15)
    fakeOrca({ tokA: sheets })
    const a = new OrcaScanAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ page: String(k), limit: '7' }, routed(a))
      expect(params.limit).toBe(7)
      seen.push(...(await list(a, 'listLocations', params)).map((l) => l.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(sheetIds(sheets))
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage publishes an exact meta.hasMore and totalCount', async () => {
    const sheets = sheetsOf(9)
    fakeOrca({ tokA: sheets })
    const a = new OrcaScanAdapter()
    const p1 = parseListQuery({ page: '1', limit: '4' }, routed(a))
    const env1 = listPage(await list(a, 'listLocations', p1), p1, 'orca-scan')
    expect(env1.data.map((l) => l.id)).toEqual(sheetIds(sheets).slice(0, 4))
    expect(env1.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 4, totalCount: 9, hasMore: true }),
    )

    const p3 = parseListQuery({ page: '3', limit: '4' }, routed(a))
    const env3 = listPage(await list(a, 'listLocations', p3), p3, 'orca-scan')
    expect(env3.data.map((l) => l.id)).toEqual(sheetIds(sheets).slice(8))
    expect(env3.meta).toEqual(
      expect.objectContaining({ page: 3, limit: 4, totalCount: 9, hasMore: false }),
    )
  })

  it('API path: an exact multiple of the limit ends with hasMore false, not null', async () => {
    const sheets = sheetsOf(8)
    fakeOrca({ tokA: sheets })
    const a = new OrcaScanAdapter()
    const p2 = parseListQuery({ page: '2', limit: '4' }, routed(a))
    const env2 = listPage(await list(a, 'listLocations', p2), p2, 'orca-scan')
    expect(env2.data.map((l) => l.id)).toEqual(sheetIds(sheets).slice(4))
    expect(env2.meta.hasMore).toBe(false)
  })

  it('a direct call with no limit gets every sheet, past any default page size', async () => {
    // 1,001 is above every page size in play (the router's default 100, its
    // cap of 500), so a default limit slipped in before pageLocally shows.
    const sheets = sheetsOf(1001)
    fakeOrca({ tokA: sheets })
    const params = withPageSink({})
    expect((await list(new OrcaScanAdapter(), 'listLocations', params)).map((l) => l.id)).toEqual(
      sheetIds(sheets),
    )
    expect(readUpstreamPage(params)).toEqual({
      totalCount: 1001,
      hasMore: false,
      pagedLocally: true,
    })
  })

  // The gate's stub body has no `data`; an empty body parses to ''; JSON null to null.
  it.each([{}, '', null])(
    'a body with no data array (%j) is an empty collection, not a crash',
    async (body) => {
      fakeOrca({ tokA: [] }, { sheetsBody: body })
      const params = withPageSink({ page: 1, limit: 4 })
      expect(await list(new OrcaScanAdapter(), 'listLocations', params)).toEqual([])
      expect(readUpstreamPage(params)).toEqual(
        expect.objectContaining({ totalCount: 0, hasMore: false }),
      )
    },
  )

  it('serves every sheet once in _id order even when GET /sheets lists them in a different order each time', async () => {
    // The spec promises no order, and each page is a fresh GET /sheets.
    const sheets = sheetsOf(9)
    const { calls } = fakeOrca({ tokA: sheets }, { shuffle: true })
    const { seen, hasMore } = await walk(new OrcaScanAdapter(), 'listLocations', 4, 3)
    expect(calls).toHaveLength(3)
    expect(seen).toEqual(sheetIds(sheets))
    expect(hasMore).toEqual([true, true, false])
  })

  it('two connections walked in turn on one adapter each see only their own sheets', async () => {
    const a = sheetsOf(9, A)
    const b = sheetsOf(5, B)
    fakeOrca({ tokA: a, tokB: b })
    const adapter = new OrcaScanAdapter()
    const seenA: string[] = []
    const seenB: string[] = []
    for (let k = 1; k <= 3; k++) {
      seenA.push(
        ...(await list(adapter, 'listLocations', withPageSink({ page: k, limit: 4 }), CREDS_A)).map(
          (l) => l.id,
        ),
      )
      seenB.push(
        ...(await list(adapter, 'listLocations', withPageSink({ page: k, limit: 4 }), CREDS_B)).map(
          (l) => l.id,
        ),
      )
    }
    expect(seenA).toEqual(sheetIds(a))
    expect(seenB).toEqual(sheetIds(b))
  })
})

// ── listProducts / listStockLevels: every sheet's rows, cut by pageByRows ───

describe.each([
  { method: 'listProducts' as const, idsOf: productIds },
  { method: 'listStockLevels' as const, idsOf: stockLevelIds },
])('orca-scan $method paging (rows of every sheet, unpaginated)', ({ method, idsOf }) => {
  it('N = 2L + 1 across sheets, one empty: three worker pages serve every row once, hasMore [true, true, false]', async () => {
    // Page 1 ends inside sheet 3, page 2 ends on its last row.
    const sheets = account([3, 0, 5, 1])
    fakeOrca({ tokA: sheets })
    const { seen, hasMore } = await walk(new OrcaScanAdapter(), method, 4, 3)
    expect(seen).toEqual(idsOf(sheets))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 is page 2: rows L+1..2L, not a repeat of page 1', async () => {
    const sheets = account([3, 0, 5, 1])
    fakeOrca({ tokA: sheets })
    const got = await list(new OrcaScanAdapter(), method, withPageSink({ page: 2, limit: 4 }))
    expect(got.map((r) => r.id)).toEqual(idsOf(sheets).slice(4, 8))
  })

  it('N = 2L ending on a sheet boundary: hasMore [true, false, false], page 3 empty', async () => {
    const sheets = account([4, 0, 4])
    fakeOrca({ tokA: sheets })
    const { seen, hasMore } = await walk(new OrcaScanAdapter(), method, 4, 3)
    expect(seen).toEqual(idsOf(sheets))
    expect(hasMore).toEqual([true, false, false])
  })

  it('walks every row at the worker limit of 500 (no declared max)', async () => {
    const sheets = account([700, 0, 450, 50])
    fakeOrca({ tokA: sheets })
    const { seen, hasMore } = await walk(new OrcaScanAdapter(), method, 500, 3)
    expect(seen).toEqual(idsOf(sheets))
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: a limit of 100000 is clamped to 500 and every row is served once, hasMore exact', async () => {
    const sheets = account([600, 401])
    fakeOrca({ tokA: sheets })
    const { seen, hasMore, limits } = await apiWalk(new OrcaScanAdapter(), method, '100000', 3)
    expect(limits).toEqual([500, 500, 500])
    expect(seen).toEqual(idsOf(sheets))
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: a page ending exactly on the last row publishes hasMore false, not null', async () => {
    const sheets = account([3, 5])
    fakeOrca({ tokA: sheets })
    const { seen, hasMore } = await apiWalk(new OrcaScanAdapter(), method, '4', 2)
    expect(seen).toEqual(idsOf(sheets))
    expect(hasMore).toEqual([true, false])
  })

  it('reports the page as paged locally', async () => {
    fakeOrca({ tokA: account([3, 0, 5, 1]) })
    const params = withPageSink({ page: 1, limit: 4 })
    await list(new OrcaScanAdapter(), method, params)
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: true, pagedLocally: true }),
    )
  })

  it('a sequential walk reads each sheet once, sending only documented requests', async () => {
    // The fake refuses any undocumented parameter. The next caller page
    // continues from the sheet the last one ended in, so rows are not read
    // again per page; the sheet list is read once per call.
    const sheets = account([3, 0, 5, 1])
    const { rowReads, sheetReads } = fakeOrca({ tokA: sheets })
    await walk(new OrcaScanAdapter(), method, 4, 3)
    expect(rowReads()).toEqual(sheetIds(sheets).map((id) => `/sheets/${id}/rows`))
    expect(sheetReads()).toBe(3)
  })

  it('filter.sheetId pages that sheet alone, without listing the sheets', async () => {
    const sheets = account([3, 0, 5, 1])
    const only = sheets[2]!
    const { rowReads, sheetReads } = fakeOrca({ tokA: sheets })
    const { seen, hasMore } = await walk(new OrcaScanAdapter(), method, 2, 3, {
      filter: { sheetId: only._id },
    })
    expect(seen).toEqual(idsOf([only]))
    expect(hasMore).toEqual([true, true, false])
    expect(sheetReads()).toBe(0)
    expect(new Set(rowReads())).toEqual(new Set([`/sheets/${only._id}/rows`]))
  })

  it('a filtered and an unfiltered walk on one connection keep their own positions', async () => {
    const sheets = account([3, 0, 5, 1])
    fakeOrca({ tokA: sheets })
    const a = new OrcaScanAdapter()
    const all = idsOf(sheets)
    const third = idsOf([sheets[2]!])
    const page = (k: number, filter?: Record<string, string>) =>
      list(a, method, withPageSink({ page: k, limit: 2, ...(filter ? { filter } : {}) })).then(
        (r) => r.map((x) => x.id),
      )
    expect(await page(1)).toEqual(all.slice(0, 2))
    expect(await page(2, { sheetId: sheets[2]!._id })).toEqual(third.slice(2, 4))
    expect(await page(2)).toEqual(all.slice(2, 4))
    expect(await page(3, { sheetId: sheets[2]!._id })).toEqual(third.slice(4, 5))
  })

  it('two connections walked in turn on one adapter each see only their own rows', async () => {
    const a = account([3, 0, 5, 1], A)
    const b = account([2, 6], B)
    fakeOrca({ tokA: a, tokB: b })
    const adapter = new OrcaScanAdapter()
    const seenA: string[] = []
    const seenB: string[] = []
    for (let k = 1; k <= 3; k++) {
      seenA.push(
        ...(await list(adapter, method, withPageSink({ page: k, limit: 4 }), CREDS_A)).map(
          (r) => r.id,
        ),
      )
      seenB.push(
        ...(await list(adapter, method, withPageSink({ page: k, limit: 4 }), CREDS_B)).map(
          (r) => r.id,
        ),
      )
    }
    expect(seenA).toEqual(idsOf(a))
    expect(seenB).toEqual(idsOf(b))
  })

  it('serves every row once in _id order when each read lists sheets and rows in a different order', async () => {
    // Reset the pager between pages, as on another replica or after its
    // one-minute idle expiry, so each page reads the sheets again.
    const sheets = account([3, 0, 5, 1])
    fakeOrca({ tokA: sheets }, { shuffle: true })
    const { seen, hasMore } = await walk(new OrcaScanAdapter(), method, 4, 3, {
      between: _resetRowPager,
    })
    expect(seen).toEqual(idsOf(sheets))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a sheet deleted between pages is skipped, and a sheet after it is still served', async () => {
    const sheets = account([3, 0, 5, 1, 2])
    const accounts = { tokA: sheets }
    fakeOrca(accounts)
    const deleted = sheets[3]!
    const { seen, hasMore } = await walk(new OrcaScanAdapter(), method, 4, 3, {
      between: () => {
        accounts.tokA = sheets.filter((s) => s !== deleted)
      },
    })
    expect(seen).toEqual(idsOf(sheets.filter((s) => s !== deleted)))
    expect(hasMore).toEqual([true, true, false])
  })

  it('reaches rows past more empty sheets than the row pager allows by default (1,000)', async () => {
    const sheets = account([...Array.from({ length: 1500 }, () => 0), 3])
    fakeOrca({ tokA: sheets }, { budget: 1510 })
    const params = withPageSink({ page: 1, limit: 4 })
    const got = await list(new OrcaScanAdapter(), method, params)
    expect(got.map((r) => r.id)).toEqual(idsOf(sheets))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it.each([{}, '', null])(
    'a body with no data array (%j) is an empty collection, not a crash',
    async (body) => {
      fakeOrca({ tokA: [] }, { sheetsBody: body })
      const params = withPageSink({ page: 1, limit: 4 })
      expect(await list(new OrcaScanAdapter(), method, params)).toEqual([])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    },
  )

  it.each([{}, '', null])(
    'a rows body with no data array (%j) is a sheet with no rows',
    async (body) => {
      fakeOrca({ tokA: account([3, 2]) }, { rowsBody: body })
      const params = withPageSink({ page: 1, limit: 4 })
      expect(await list(new OrcaScanAdapter(), method, params)).toEqual([])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    },
  )
})

describe('orca-scan products and stock levels on one connection', () => {
  it('keep their own rows: a stock-level page never comes from a product walk', async () => {
    const sheets = account([3, 0, 5, 1])
    fakeOrca({ tokA: sheets })
    const a = new OrcaScanAdapter()
    const products = (await list(a, 'listProducts', withPageSink({ page: 1, limit: 4 }))).map(
      (r) => r.id,
    )
    const levels = (await list(a, 'listStockLevels', withPageSink({ page: 2, limit: 4 }))).map(
      (r) => r.id,
    )
    const products2 = (await list(a, 'listProducts', withPageSink({ page: 2, limit: 4 }))).map(
      (r) => r.id,
    )
    expect(products).toEqual(productIds(sheets).slice(0, 4))
    expect(levels).toEqual(stockLevelIds(sheets).slice(4, 8))
    expect(products2).toEqual(productIds(sheets).slice(4, 8))
  })
})
