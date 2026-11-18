/**
 * Lightspeed Retail (X-Series) lists page through the API 2.0 version keyset,
 * one caller page per upstream page.
 *
 * From https://x-series-api.lightspeedhq.com/v1.0/docs/pagination.md (API 2.0):
 *
 *   "The highest `version` number `x` from this collection (the `max`
 *    attribute above) should be used to request the next page like:
 *    /api/2.0/products?after=x
 *    This should be repeated until an empty collection is returned. This will
 *    mean that all items of the collection have been returned."
 *   "The response to that request should include a collection of `0` to `n`
 *    resources. The upper limit will probably be different depending on the
 *    endpoint."
 *   "Objects in returned collections will be sorted by the version number in
 *    an ascending order."
 *   "The `version` attribute is simply a monotonically increasing integer."
 *
 * and from each list operation of the API 2.0 reference (listproducts,
 * listinventoryrecords, listoutlets-1, listsuppliers-1 and getconsignments,
 * under https://x-series-api.lightspeedhq.com/v1.0/reference/):
 *
 *   `after`: "The lower limit for the version numbers to be included in the response."
 *   `page_size`: "The maximum number of items to be returned in the response."
 *   `type` (consignments only): "The consignment type to search for."
 *     SUPPLIER | OUTLET | STOCKTAKE | RETURN
 *
 * `after` is exclusive: "if you select all entries with version greater than
 * 158306 in this case, you are guaranteed to get all the entries"
 * (https://x-series-api.lightspeedhq.com/v1.0/docs/sync_entity_to_external_system.md).
 *
 * Page size: the same guide says "the results are returned with a default
 * pagination size of 200, i.e. not more than 200 results will be returned at
 * a time", and advises against raising `page_size` ("you may hit issues with
 * timeouts and secondly, some queries are limited"). No hard maximum is
 * documented for API 2.0, so the adapter declares 200 as its `maxPageSize` and
 * never sends more.
 *
 * The end: only an empty collection is one. A page shorter than `page_size`
 * may be an endpoint's own limit, so a short page asks for one row past it
 * (`page_size=1`) and is the last only when that comes back empty. A full
 * page says `hasMore: true`, and the next caller page asks.
 *
 * Consignments: the legacy 2.0 reference types the 200 response as a bare
 * array of Consignment, each with a `version` ("Auto-incrementing object
 * version number."), while the current reference
 * (https://x-series-api.lightspeedhq.com/reference/getconsignments.md) answers
 * `{ data, version }`, whose `max` is "Highest version number of the payload,
 * or `null` when the result set is empty." Both shapes page.
 *
 * The adapter used to walk the whole collection on every call and ignore
 * `page`, so every caller page returned every row and the router truncated
 * each one to the first `limit`: rows past page 1 were unreachable.
 *
 * The fake below sits at the axios seam (`axios.defaults.adapter`, the same
 * one `check:paging-contract` records at) and honours ONLY `after`,
 * `page_size` and, on /consignments, `type`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import {
  _resetCursorPager,
  collectionIsComplete,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { InventoryAdapter } from '../../../../../../src/verticals/inventory/adapter/interface'
import { LightspeedInventoryAdapter } from '../../../../../../src/verticals/inventory/adapters/lightspeed-inventory/index'

const DOMAIN = 'acme'
const HOST = `https://${DOMAIN}.retail.lightspeed.app`
const OTHER_DOMAIN = 'globex'
const OTHER_HOST = `https://${OTHER_DOMAIN}.retail.lightspeed.app`
const TOKEN = 'ls-access-token'
const OTHER_TOKEN = 'ls-other-access-token'
const REFRESHED_TOKEN = 'ls-refreshed-access-token'
const TOKENS = new Set([TOKEN, OTHER_TOKEN, REFRESHED_TOKEN])
const CREDS: Credentials = {
  accessToken: TOKEN,
  refreshToken: 'ls-refresh-token',
  extra: { domainPrefix: DOMAIN },
}
/** A second connection to the same store, under another user's grant. */
const OTHER_CREDS: Credentials = {
  accessToken: OTHER_TOKEN,
  refreshToken: 'ls-other-refresh-token',
  extra: { domainPrefix: DOMAIN },
}
/** CREDS after an access-token refresh: the same grant, so the same refresh token. */
const REFRESHED_CREDS: Credentials = { ...CREDS, accessToken: REFRESHED_TOKEN }
/** Another store, reached under exactly CREDS's tokens. */
const OTHER_STORE_CREDS: Credentials = { ...CREDS, extra: { domainPrefix: OTHER_DOMAIN } }
const CONFIG = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://app.example.test/callback',
}
const CONSIGNMENT_TYPES = ['SUPPLIER', 'OUTLET', 'STOCKTAKE', 'RETURN'] as const
/** The documented default page, and the adapter's declared maximum. */
const MAX = 200

interface Row {
  id: string
  version: number
  type?: string
  product_id?: string
  outlet_id?: string
}
type Dataset = Record<string, Row[]>

interface Seen {
  path: string
  query: Record<string, string>
}

interface FakeOpts {
  /** The endpoint's own upper limit: "probably be different depending on the endpoint". */
  cap?: number
  /** Consignments answer as the legacy 2.0 reference types them: a bare array. */
  bareConsignments?: boolean
  /** Collections answer without their `version` object. */
  noVersion?: boolean
  /** Every version, the rows' and the collection's, arrives as a JSON string. */
  stringVersions?: boolean
  /** A broken upstream that ignores `after` and serves page 1 again. */
  ignoreAfter?: boolean
  /** A broken upstream whose `version.max` falls behind the `after` it was sent. */
  maxBehind?: boolean
  /** An empty collection whose `version` echoes the `after` it was sent, instead of null. */
  emptyEchoesAfter?: boolean
  /** The rows of a second store, served at OTHER_HOST. */
  otherStore?: Dataset
}

function rowId(tag: string, i: number): string {
  return `${tag}-${String(i).padStart(4, '0')}`
}

const ids = (rows: ReadonlyArray<{ id: string }>): string[] => rows.map((r) => r.id)

/**
 * Each collection's versions start at their own base, so a cursor handed to
 * the wrong collection lands on the wrong rows instead of the right ones by
 * coincidence. Every collection is well under 100,000 versions long.
 */
const VERSION_BASE: Record<string, number> = {
  '/products': 100_000,
  '/inventory': 200_000,
  '/outlets': 300_000,
  '/suppliers': 400_000,
  '/consignments': 500_000,
}

/**
 * `n` rows in each collection and of each consignment type. Versions ascend
 * but skip (steps of 7), so a cursor that is a count or an offset lands on the
 * wrong row; consignment types are interleaved, so a `type` the fake ignored
 * would serve other types' rows. A named `store` gets its own ids and
 * versions 50,000 past the default store's.
 */
function dataset(n: number, store?: string): Dataset {
  const prefix = store ? `${store}-` : ''
  const base = (path: string): number => VERSION_BASE[path]! + (store ? 50_000 : 0)
  const simple = (path: string, tag: string): Row[] =>
    Array.from({ length: n }, (_, i) => ({
      id: rowId(`${prefix}${tag}`, i + 1),
      version: base(path) + 7 * (i + 1),
      product_id: `prod-${i + 1}`,
      outlet_id: 'outlet-1',
    }))
  const consignments = Array.from({ length: n * CONSIGNMENT_TYPES.length }, (_, j) => {
    const type = CONSIGNMENT_TYPES[j % CONSIGNMENT_TYPES.length]!
    return {
      id: rowId(`${prefix}${type}`, Math.floor(j / CONSIGNMENT_TYPES.length) + 1),
      version: base('/consignments') + 7 * (j + 1),
      type,
      outlet_id: 'outlet-1',
    }
  })
  return {
    '/products': simple('/products', 'products'),
    '/inventory': simple('/inventory', 'inventory'),
    '/outlets': simple('/outlets', 'outlets'),
    '/suppliers': simple('/suppliers', 'suppliers'),
    '/consignments': consignments,
  }
}

const realAdapter = axios.defaults.adapter

function fakeLightspeed(data: Dataset, opts: FakeOpts = {}): { seen: Seen[]; origins: string[] } {
  const seen: Seen[] = []
  const origins: string[] = []
  const stores: Record<string, Dataset | undefined> = {
    [HOST]: data,
    [OTHER_HOST]: opts.otherStore,
  }
  const fake: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const reply = (status: number, payload: unknown): AxiosResponse => {
      const response: AxiosResponse = {
        data: JSON.stringify(payload),
        status,
        statusText: String(status),
        headers: { 'content-type': 'application/json' },
        config,
        request: {},
      }
      if (status >= 400) {
        throw new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response)
      }
      return response
    }
    const url = new URL(axios.getUri(config))
    const store = stores[url.origin]
    if (!store || !url.pathname.startsWith('/api/2.0/')) {
      return reply(404, { error: `no route ${url.href}` })
    }
    const auth = new AxiosHeaders(config.headers).get('Authorization')
    if (typeof auth !== 'string' || !TOKENS.has(auth.replace(/^Bearer /, ''))) {
      return reply(401, { error: 'invalid_token' })
    }
    const path = url.pathname.slice('/api/2.0'.length)
    const all = store[path]
    if (!all) return reply(404, { error: `unexpected GET ${path}` })
    const q = url.searchParams
    seen.push({ path, query: Object.fromEntries(q) })
    origins.push(url.origin)

    const size = q.has('page_size') ? Number(q.get('page_size')) : Infinity
    if (q.has('page_size') && (!Number.isInteger(size) || size < 1)) {
      return reply(400, {
        error: `page_size must be a positive integer (got ${q.get('page_size')})`,
      })
    }
    const sentAfter = q.has('after') ? Number(q.get('after')) : undefined
    const after = sentAfter !== undefined && !opts.ignoreAfter ? sentAfter : -Infinity
    const type = path === '/consignments' ? q.get('type') : null
    const rows = all
      .filter((r) => type === null || r.type === type)
      .filter((r) => r.version > after)
      .sort((a, b) => a.version - b.version)
      .slice(0, Math.min(size, opts.cap ?? Infinity))

    const asSent = (v: number | null): number | string | null =>
      v !== null && opts.stringVersions ? String(v) : v
    const body = rows.map((r) => ({ ...r, version: asSent(r.version) }))
    if (path === '/consignments' && opts.bareConsignments) return reply(200, body)
    let min = rows[0]?.version ?? null
    let max = rows[rows.length - 1]?.version ?? null
    if (rows.length === 0 && opts.emptyEchoesAfter && sentAfter !== undefined) {
      min = max = sentAfter
    }
    if (rows.length > 0 && opts.maxBehind && sentAfter !== undefined) max = sentAfter - 1
    return reply(200, {
      data: body,
      ...(opts.noVersion ? {} : { version: { min: asSent(min), max: asSent(max) } }),
    })
  }
  axios.defaults.adapter = fake
  return { seen, origins }
}

type Call = (
  a: LightspeedInventoryAdapter,
  c: Credentials,
  p: QueryParams,
) => Promise<Array<{ id: string }>>

interface Method {
  name: string
  path: string
  type?: string
  call: Call
}

const METHODS: Method[] = [
  { name: 'listProducts', path: '/products', call: (a, c, p) => a.listProducts(c, p) },
  { name: 'listStockLevels', path: '/inventory', call: (a, c, p) => a.listStockLevels(c, p) },
  { name: 'listLocations', path: '/outlets', call: (a, c, p) => a.listLocations(c, p) },
  { name: 'listSuppliers', path: '/suppliers', call: (a, c, p) => a.listSuppliers(c, p) },
  {
    name: 'listPurchaseOrders',
    path: '/consignments',
    type: 'SUPPLIER',
    call: (a, c, p) => a.listPurchaseOrders(c, p),
  },
  {
    name: 'listStockTransfers',
    path: '/consignments',
    type: 'OUTLET',
    call: (a, c, p) => a.listStockTransfers(c, p),
  },
  {
    name: 'listStockAdjustments',
    path: '/consignments',
    type: 'STOCKTAKE',
    call: (a, c, p) => a.listStockAdjustments(c, p),
  },
]
const CONSIGNMENTS = METHODS.filter((m) => m.path === '/consignments')
const byName = (name: string): Method => METHODS.find((m) => m.name === name)!

/** The rows a method lists, in the order Lightspeed serves them. */
function rowsOf(data: Dataset, m: Method): Row[] {
  return data[m.path]!.filter((r) => m.type === undefined || r.type === m.type).sort(
    (a, b) => a.version - b.version,
  )
}

/** The query a method sends: `page_size`, its `type`, and `after` from page 2 on. */
function expectedQuery(m: Method, pageSize: number, after?: number): Record<string, string> {
  return {
    page_size: String(pageSize),
    ...(m.type ? { type: m.type } : {}),
    ...(after !== undefined ? { after: String(after) } : {}),
  }
}

/** Params as the inventory routers build them: `parseListQuery(request.query, adapter)`. */
function routerQuery(q: Record<string, string>, adapter: LightspeedInventoryAdapter): QueryParams {
  return parseListQuery(q, adapter as InventoryAdapter)
}

/** Drive a method the way the sync worker does: pages 1..`pages` at `limit`. */
async function drive(m: Method, limit: number, pages: number, creds: Credentials = CREDS) {
  const adapter = new LightspeedInventoryAdapter(CONFIG)
  const served: string[][] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    served.push(ids(await m.call(adapter, creds, params)))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { served, hasMore }
}

/** Pages 1..`pages` through the API path: `parseListQuery` + the adapter + `listPage`. */
async function viaRouter(m: Method, query: Record<string, string>, pages: number) {
  const adapter = new LightspeedInventoryAdapter(CONFIG)
  const out: Array<{ ids: string[]; hasMore: boolean | null; limit: number }> = []
  for (let page = 1; page <= pages; page++) {
    const params = routerQuery({ ...query, page: String(page) }, adapter)
    const envelope = listPage(await m.call(adapter, CREDS, params), params, 'lightspeed-inventory')
    out.push({
      ids: ids(envelope.data),
      hasMore: envelope.meta.hasMore,
      limit: envelope.meta.limit,
    })
  }
  return out
}

beforeEach(() => _resetCursorPager())
afterEach(() => {
  axios.defaults.adapter = realAdapter
  _resetCursorPager()
})

describe.each(METHODS)('lightspeed-inventory $name paging', (m) => {
  it('serves every row once, in order, one caller page per request (N = 2L + 1)', async () => {
    const L = 10
    const data = dataset(2 * L + 1)
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data)

    const { served, hasMore } = await drive(m, L, 4)

    expect(served.map((p) => p.length)).toEqual([L, L, 1, 0])
    expect(served.flat()).toEqual(ids(all))
    // Page 3 is short, and the one row past it comes back empty: page 3 is the
    // last, and page 4 needs no request.
    expect(hasMore).toEqual([true, true, false, false])
    expect(seen).toEqual([
      { path: m.path, query: expectedQuery(m, L) },
      { path: m.path, query: expectedQuery(m, L, all[L - 1]!.version) },
      { path: m.path, query: expectedQuery(m, L, all[2 * L - 1]!.version) },
      { path: m.path, query: expectedQuery(m, 1, all[2 * L]!.version) },
    ])
  })

  it('stops where the sync worker stops, with every row served (N = 2L + 1)', async () => {
    const L = 7
    const data = dataset(2 * L + 1)
    fakeLightspeed(data)
    const adapter = new LightspeedInventoryAdapter(CONFIG)
    const seen: string[] = []
    let pages = 0
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = ids(await m.call(adapter, CREDS, params))
      pages++
      seen.push(...rows)
      // The worker's rule: the adapter's report when it gave one, else a short page.
      const reported = readUpstreamPage(params)?.hasMore
      if (typeof reported === 'boolean' ? !reported : rows.length < L) break
    }
    expect(seen).toEqual(ids(rowsOf(data, m)))
    expect(pages).toBe(3)
  })

  it('ends on the empty page after the last full one (N = 2L)', async () => {
    const L = 10
    const data = dataset(2 * L)
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data)

    const { served, hasMore } = await drive(m, L, 3)

    expect(served.map((p) => p.length)).toEqual([L, L, 0])
    expect(served.flat()).toEqual(ids(all))
    // A full page says nothing about what follows; the next caller page asks.
    expect(hasMore).toEqual([true, true, false])
    expect(seen).toEqual([
      { path: m.path, query: expectedQuery(m, L) },
      { path: m.path, query: expectedQuery(m, L, all[L - 1]!.version) },
      { path: m.path, query: expectedQuery(m, L, all[2 * L - 1]!.version) },
    ])
  })

  it("page 2 sends the documented after = page 1's version.max, at page_size = the limit", async () => {
    const L = 10
    const data = dataset(3 * L)
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data)
    const adapter = new LightspeedInventoryAdapter(CONFIG)

    await m.call(adapter, CREDS, withPageSink({ page: 1, limit: L }))
    const page1 = seen.splice(0)
    await m.call(adapter, CREDS, withPageSink({ page: 2, limit: L }))

    // Each caller page is exactly one request.
    expect(page1).toEqual([{ path: m.path, query: expectedQuery(m, L) }])
    expect(seen).toEqual([{ path: m.path, query: expectedQuery(m, L, all[L - 1]!.version) }])
  })

  it('a page asked for cold walks the version chain to it', async () => {
    const L = 10
    const data = dataset(3 * L + 5)
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data)
    const params = withPageSink({ page: 3, limit: L })

    const rows = await m.call(new LightspeedInventoryAdapter(CONFIG), CREDS, params)

    expect(ids(rows)).toEqual(ids(all.slice(2 * L, 3 * L)))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(seen.map((s) => s.query['after'])).toEqual([
      undefined,
      String(all[L - 1]!.version),
      String(all[2 * L - 1]!.version),
    ])
  })

  it('sends the limit as parseListQuery delivers it: capped at the declared 200, and the default', async () => {
    const data = dataset(MAX + 50)
    const { seen } = fakeLightspeed(data)
    const adapter = new LightspeedInventoryAdapter(CONFIG)

    await m.call(adapter, CREDS, routerQuery({ limit: '1000' }, adapter))
    await m.call(adapter, CREDS, routerQuery({ limit: '150' }, adapter))
    await m.call(adapter, CREDS, routerQuery({}, adapter))

    expect(seen.map((s) => s.query['page_size'])).toEqual(['200', '150', '100'])
  })

  it('declares the documented 200 as its maximum and serves every row once at it (API path)', async () => {
    const data = dataset(2 * MAX + 50)
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data)
    expect(new LightspeedInventoryAdapter(CONFIG).capabilities.maxPageSize).toBe(MAX)

    // The caller asks for 500; the router caps it at the declared 200.
    const pages = await viaRouter(m, { limit: '500' }, 3)

    expect(pages.map((p) => p.ids.length)).toEqual([MAX, MAX, 50])
    expect(pages.flatMap((p) => p.ids)).toEqual(ids(all))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages.map((p) => p.limit)).toEqual([MAX, MAX, MAX])
    expect(seen.map((s) => s.query['page_size'])).toEqual(['200', '200', '200', '1'])
  })

  it('an endpoint that serves fewer than page_size still reaches every row (API path)', async () => {
    // "some queries are limited": model an endpoint that stops at 150.
    const CAP = 150
    const data = dataset(2 * CAP + 50)
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data, { cap: CAP })

    const pages = await viaRouter(m, { limit: String(MAX) }, 3)

    expect(pages.map((p) => p.ids.length)).toEqual([CAP, CAP, 50])
    expect(pages.flatMap((p) => p.ids)).toEqual(ids(all))
    // A short page is not the end until the row past it comes back empty.
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(seen.map((s) => [s.query['page_size'], s.query['after']])).toEqual([
      ['200', undefined],
      ['1', String(all[CAP - 1]!.version)],
      ['200', String(all[CAP - 1]!.version)],
      ['1', String(all[2 * CAP - 1]!.version)],
      ['200', String(all[2 * CAP - 1]!.version)],
      ['1', String(all[2 * CAP + 49]!.version)],
    ])
  })

  it('the API path (parseListQuery + listPage) reports meta.hasMore from the version chain', async () => {
    const L = 10
    const data = dataset(2 * L + 1)
    const all = rowsOf(data, m)
    fakeLightspeed(data)

    const pages = await viaRouter(m, { limit: String(L) }, 4)

    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false, false])
    expect(pages.flatMap((p) => p.ids)).toEqual(ids(all))
  })

  it('a collection shorter than one page is whole on page 1, and cacheable (API path)', async () => {
    const data = dataset(3)
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data)
    const adapter = new LightspeedInventoryAdapter(CONFIG)
    const params = routerQuery({}, adapter)

    const rows = await m.call(adapter, CREDS, params)
    const envelope = listPage(rows, params, 'lightspeed-inventory')

    expect(ids(envelope.data)).toEqual(ids(all))
    expect(envelope.meta.hasMore).toBe(false)
    expect(collectionIsComplete(params, rows)).toBe(true)
    expect(seen).toEqual([
      { path: m.path, query: expectedQuery(m, 100) },
      { path: m.path, query: expectedQuery(m, 1, all[2]!.version) },
    ])
  })

  it('pages when versions arrive as JSON strings', async () => {
    const L = 10
    const data = dataset(2 * L + 1)
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data, { stringVersions: true })

    const { served, hasMore } = await drive(m, L, 3)

    expect(served.flat()).toEqual(ids(all))
    expect(hasMore).toEqual([true, true, false])
    expect(seen[1]).toEqual({ path: m.path, query: expectedQuery(m, L, all[L - 1]!.version) })
  })
})

describe('lightspeed-inventory page size and report on a direct call', () => {
  // The router and the sync worker always pass a whole limit of at most 200;
  // anything else reaches the adapter only from a direct call.
  it.each([
    ['no limit', '200', {}, { hasMore: true }],
    ['limit 0', '200', { limit: 0 }, { hasMore: true }],
    ['a negative limit', '200', { limit: -5 }, { hasMore: true }],
    ['limit 10', '10', { limit: 10 }, { hasMore: true }],
    ['a fractional limit', '7', { limit: 7.9 }, { hasMore: true, pageSize: 7 }],
    ['a limit past the maximum', '200', { limit: 500 }, { hasMore: true, pageSize: 200 }],
  ] as Array<[string, string, Partial<QueryParams>, Record<string, unknown>]>)(
    '%s sends page_size=%s and reports exactly what it sent',
    async (_label, pageSize, limit, report) => {
      const data = dataset(2 * MAX + 50)
      const m = byName('listProducts')
      const { seen } = fakeLightspeed(data)
      const params = withPageSink({ page: 1, ...limit })

      const rows = await m.call(new LightspeedInventoryAdapter(CONFIG), CREDS, params)

      expect(seen.map((s) => s.query['page_size'])).toEqual([pageSize])
      expect(ids(rows)).toEqual(ids(rowsOf(data, m).slice(0, Number(pageSize))))
      expect(readUpstreamPage(params)).toStrictEqual(report)
    },
  )
})

describe('lightspeed-inventory pager keys', () => {
  it('never shares a cursor between two connections to the same store', async () => {
    const L = 10
    const data = dataset(3 * L)
    const m = byName('listProducts')
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data)

    await drive(m, L, 1, CREDS)
    seen.length = 0
    const other = withPageSink({ page: 2, limit: L })
    const rows = await m.call(new LightspeedInventoryAdapter(CONFIG), OTHER_CREDS, other)

    expect(ids(rows)).toEqual(ids(all.slice(L, 2 * L)))
    // The second connection walks its own chain from page 1.
    expect(seen.map((s) => s.query['after'])).toEqual([undefined, String(all[L - 1]!.version)])
  })

  it('keeps a connection’s cursors across an access-token refresh', async () => {
    const L = 10
    const data = dataset(3 * L)
    const m = byName('listProducts')
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data)

    await drive(m, L, 1, CREDS)
    seen.length = 0
    const params = withPageSink({ page: 2, limit: L })
    const rows = await m.call(new LightspeedInventoryAdapter(CONFIG), REFRESHED_CREDS, params)

    expect(ids(rows)).toEqual(ids(all.slice(L, 2 * L)))
    // The refresh token names the connection, so page 2 is still one request.
    expect(seen).toEqual([{ path: m.path, query: expectedQuery(m, L, all[L - 1]!.version) }])
  })

  it('never shares a cursor between two stores, even under the same tokens', async () => {
    const L = 10
    const data = dataset(3 * L)
    const theirData = dataset(3 * L, OTHER_DOMAIN)
    const m = byName('listProducts')
    const theirs = rowsOf(theirData, m)
    const { seen, origins } = fakeLightspeed(data, { otherStore: theirData })

    await drive(m, L, 1, CREDS)
    seen.length = 0
    origins.length = 0
    const params = withPageSink({ page: 2, limit: L })
    const rows = await m.call(new LightspeedInventoryAdapter(CONFIG), OTHER_STORE_CREDS, params)

    expect(ids(rows)).toEqual(ids(theirs.slice(L, 2 * L)))
    expect(seen.map((s) => s.query['after'])).toEqual([undefined, String(theirs[L - 1]!.version)])
    expect(origins).toEqual([OTHER_HOST, OTHER_HOST])
  })

  it('never hands one consignment type the cursor of another', async () => {
    const L = 10
    const data = dataset(3 * L)
    const transfers = byName('listStockTransfers')
    const orders = byName('listPurchaseOrders')
    const { seen } = fakeLightspeed(data)

    await drive(transfers, L, 1)
    seen.length = 0
    const params = withPageSink({ page: 2, limit: L })
    const rows = await orders.call(new LightspeedInventoryAdapter(CONFIG), CREDS, params)

    const supplier = rowsOf(data, orders)
    expect(ids(rows)).toEqual(ids(supplier.slice(L, 2 * L)))
    expect(seen).toEqual([
      { path: '/consignments', query: expectedQuery(orders, L) },
      { path: '/consignments', query: expectedQuery(orders, L, supplier[L - 1]!.version) },
    ])
  })

  it('never reuses a cursor minted at another page size', async () => {
    const data = dataset(30)
    const m = byName('listProducts')
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data)

    await drive(m, 10, 1)
    seen.length = 0
    const params = withPageSink({ page: 2, limit: 7 })
    const rows = await m.call(new LightspeedInventoryAdapter(CONFIG), CREDS, params)

    expect(ids(rows)).toEqual(ids(all.slice(7, 14)))
    expect(seen).toEqual([
      { path: m.path, query: expectedQuery(m, 7) },
      { path: m.path, query: expectedQuery(m, 7, all[6]!.version) },
    ])
  })

  it.each(METHODS)('never hands $name the cursor of another collection', async (m) => {
    const L = 10
    const data = dataset(3 * L)
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data)

    // Every other list walks to page 2 first, leaving cursors for pages 2 and 3.
    for (const other of METHODS) if (other !== m) await drive(other, L, 2)
    seen.length = 0
    const params = withPageSink({ page: 2, limit: L })
    const rows = await m.call(new LightspeedInventoryAdapter(CONFIG), CREDS, params)

    expect(ids(rows)).toEqual(ids(all.slice(L, 2 * L)))
    expect(seen).toEqual([
      { path: m.path, query: expectedQuery(m, L) },
      { path: m.path, query: expectedQuery(m, L, all[L - 1]!.version) },
    ])
  })
})

describe.each(CONSIGNMENTS)('lightspeed-inventory $name response shapes', (m) => {
  it.each([
    ['the legacy 2.0 bare array', { bareConsignments: true }],
    [
      'the legacy 2.0 bare array, with versions as strings',
      { bareConsignments: true, stringVersions: true },
    ],
    ['a collection without its version object', { noVersion: true }],
  ] as const)('pages %s by the rows’ own version', async (_label, opts) => {
    const L = 10
    const data = dataset(2 * L + 1)
    const all = rowsOf(data, m)
    const { seen } = fakeLightspeed(data, opts)

    const { served, hasMore } = await drive(m, L, 3)

    expect(served.flat()).toEqual(ids(all))
    expect(hasMore).toEqual([true, true, false])
    expect(seen[1]).toEqual({ path: m.path, query: expectedQuery(m, L, all[L - 1]!.version) })
  })
})

describe('lightspeed-inventory against an upstream that breaks the version keyset', () => {
  it('refuses a version that does not advance (after ignored), instead of serving page 1 again', async () => {
    const L = 10
    const data = dataset(3 * L)
    const m = byName('listProducts')
    const { seen } = fakeLightspeed(data, { ignoreAfter: true })
    const adapter = new LightspeedInventoryAdapter(CONFIG)

    const page1 = await m.call(adapter, CREDS, withPageSink({ page: 1, limit: L }))
    expect(ids(page1)).toEqual(ids(rowsOf(data, m).slice(0, L)))

    await expect(m.call(adapter, CREDS, withPageSink({ page: 2, limit: L }))).rejects.toThrow(
      /does not advance the version cursor/,
    )
    expect(seen).toHaveLength(2)
  })

  it('refuses a version that moves backwards', async () => {
    const L = 10
    const data = dataset(3 * L)
    const m = byName('listProducts')
    const { seen } = fakeLightspeed(data, { maxBehind: true })
    const adapter = new LightspeedInventoryAdapter(CONFIG)

    await m.call(adapter, CREDS, withPageSink({ page: 1, limit: L }))

    await expect(m.call(adapter, CREDS, withPageSink({ page: 2, limit: L }))).rejects.toThrow(
      /does not advance the version cursor/,
    )
    expect(seen).toHaveLength(2)
  })

  it('an empty collection ends the walk whatever its version object says', async () => {
    const L = 10
    const data = dataset(2 * L + 1)
    const m = byName('listProducts')
    fakeLightspeed(data, { emptyEchoesAfter: true })

    const { served, hasMore } = await drive(m, L, 3)

    expect(served.flat()).toEqual(ids(rowsOf(data, m)))
    expect(hasMore).toEqual([true, true, false])
  })
})
