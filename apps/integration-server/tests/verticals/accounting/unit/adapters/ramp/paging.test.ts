/**
 * Ramp list paging: every list serves the caller's page `page` at `limit`.
 *
 * All seven list endpoints the adapter reads share one keyset contract
 * (https://docs.ramp.com/openapi/developer-api.json):
 *   start      "The ID of the last entity of the previous page, used for
 *               pagination to get the next page."
 *   page_size  "The number of results to be returned in each page. The value
 *               must be between 2 and 100. If not specified, the default
 *               value 20 will be used."
 *   page.next  "the query to get to the next page; it is in the format of
 *               <BASE_URL>?<new_params>" (nullable)
 * and the pagination guide (https://docs.ramp.com/llms-guides/pagination.txt):
 *   "Use the complete URL in the next field to request the next page. The URL
 *    includes the start cursor and preserves the other query parameters
 *    required for the current result set. Treat the cursor as opaque instead
 *    of constructing or changing it yourself."
 *   "... until the API returns a null value for the next field."
 *
 * The adapter used to send `page_size` and never `start`, and dropped
 * `page.next`, so page 2 of every list was page 1 again.
 *
 * The fake upstream below honours ONLY the documented parameters: `start`,
 * `page_size` (2..100, else 400; 20 when absent) and `from_date` where the
 * endpoint documents it. It answers at the seam every Ramp request crosses,
 * axios's transport, so the URL a request reaches is the one axios really
 * builds from the client's baseURL, path and params.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { RampAdapter } from '../../../../../../src/verticals/accounting/adapters/ramp/index'

const ORIGIN = 'https://api.ramp.com'
const BASE_PATH = '/developer/v1/'
const DOC_MIN = 2
const DOC_MAX = 100
const DOC_DEFAULT = 20

const adapter = new RampAdapter({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://example.test/callback',
  scopes: ['accounting:read'],
})

const CREDS_A = { accessToken: 'tok-a', refreshToken: 'refresh-a' }
const CREDS_B = { accessToken: 'tok-b', refreshToken: 'refresh-b' }

// ── the fake upstream ────────────────────────────────────────────────────

interface Row {
  id: string
  [key: string]: unknown
}

type World = Record<string, Row[]>

interface Seen {
  url: URL
  token: string
  /** The `page.next` this request was answered with. */
  next?: string | null
}

interface FakeOptions {
  /** Answer a full last page with a `next` anyway; the page after it is empty. */
  trailingNext?: boolean
  /**
   * Put an opaque parameter in every `page.next`, the way the guide allows
   * ("preserves the other query parameters required for the current result
   * set"). An adapter that rebuilds the next request from `start` drops it.
   */
  opaqueNext?: boolean
  /** Answer the first page one row short of `page_size`, with a `next` all the same. */
  shortFirstPage?: boolean
  /** Hand back this instead of the `page.next` URL the fake minted. */
  rewriteNext?: (next: URL) => string
}

/** The row field `from_date` filters on, where the endpoint documents it. */
const FROM_DATE_FIELD: Record<string, string> = {
  // "Filter for transactions with a `user_transaction_time` after the given date"
  transactions: 'user_transaction_time',
  // "Filter reimbursements created after this date."
  reimbursements: 'created_at',
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { response: { status, data: { error_v2: message } } })
}

let seen: Seen[] = []
const realAdapter = axios.defaults.adapter

function fakeRamp(worldFor: (token: string) => World, opts: FakeOptions = {}): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    const auth = String(config.headers?.get?.('Authorization') ?? config.headers?.['Authorization'])
    const token = auth.replace(/^Bearer /, '')
    const entry: Seen = { url, token }
    seen.push(entry)
    if (url.origin !== ORIGIN || !url.pathname.startsWith(BASE_PATH))
      throw httpError(404, `no such host or path: ${url.origin}${url.pathname}`)
    const path = url.pathname.slice(BASE_PATH.length)
    const all = worldFor(token)[path]
    if (!all) throw httpError(404, `no route ${path}`)

    const q = url.searchParams
    const size = q.has('page_size') ? Number(q.get('page_size')) : DOC_DEFAULT
    if (!Number.isInteger(size) || size < DOC_MIN || size > DOC_MAX)
      throw httpError(400, `page_size must be between ${DOC_MIN} and ${DOC_MAX}`)

    let rows = all
    const from = q.get('from_date')
    const field = FROM_DATE_FIELD[path]
    if (from !== null && field) {
      const t = Date.parse(from)
      if (Number.isNaN(t)) throw httpError(400, `from_date is not a date: ${from}`)
      rows = rows.filter((r) => Date.parse(String(r[field])) > t)
    }

    let first = 0
    const start = q.get('start')
    if (start !== null) {
      const i = rows.findIndex((r) => r.id === start)
      if (i < 0) throw httpError(400, `start ${start} is not an entity of this list`)
      first = i + 1
    }
    const take = opts.shortFirstPage === true && start === null ? size - 1 : size
    const data = rows.slice(first, first + take)
    const more = first + take < rows.length || (opts.trailingNext === true && data.length === size)
    let next: string | null = null
    if (more) {
      const n = new URL(url.href)
      n.searchParams.set('start', data[data.length - 1]!.id)
      if (opts.opaqueNext) n.searchParams.set('_sig', `opaque+/=${first}`)
      next = opts.rewriteNext ? opts.rewriteNext(n) : n.href
    }
    entry.next = next
    return {
      data: { data, page: { next } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

const listRequests = (path: string) => seen.filter((s) => s.url.pathname === `${BASE_PATH}${path}`)

const day = (i: number): string => new Date(Date.UTC(2026, 0, 1 + i, 12)).toISOString()

// ── the lists ────────────────────────────────────────────────────────────

type ListMethod =
  | 'listAccounts'
  | 'listContacts'
  | 'listTransactions'
  | 'listExpenses'
  | 'listBills'
  | 'listPurchaseOrders'
  | 'listTaxRates'

interface ListCase {
  method: ListMethod
  path: string
  rows: (n: number, tag?: string) => Row[]
}

const plain =
  (prefix: string) =>
  (n: number, tag = ''): Row[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${tag}${prefix}_${i}`, name: `${prefix} ${i}` }))

const LISTS: ListCase[] = [
  { method: 'listAccounts', path: 'accounting/accounts', rows: plain('gl') },
  { method: 'listContacts', path: 'accounting/vendors', rows: plain('ven') },
  {
    method: 'listTransactions',
    path: 'transactions',
    rows: (n, tag = '') =>
      Array.from({ length: n }, (_, i) => ({
        id: `${tag}txn_${i}`,
        user_transaction_time: day(i),
        amount: { amount: i, currency_code: 'USD' },
      })),
  },
  {
    method: 'listExpenses',
    path: 'reimbursements',
    rows: (n, tag = '') =>
      Array.from({ length: n }, (_, i) => ({ id: `${tag}reimb_${i}`, created_at: day(i) })),
  },
  { method: 'listBills', path: 'bills', rows: plain('bill') },
  { method: 'listPurchaseOrders', path: 'purchase-orders', rows: plain('po') },
  { method: 'listTaxRates', path: 'accounting/tax/rates', rows: plain('tax') },
]

function call(
  method: ListMethod,
  creds: typeof CREDS_A,
  params: QueryParams,
): Promise<Array<{ id?: string }>> {
  const list = adapter[method] as (
    this: RampAdapter,
    c: typeof CREDS_A,
    p: QueryParams,
  ) => Promise<Array<{ id?: string }>>
  return list.call(adapter, creds, params)
}

/** Call a list the way the sync worker does: `withPageSink({ page, limit })`. */
async function syncPage(method: ListMethod, page: number, limit: number, creds = CREDS_A) {
  const params = withPageSink({ page, limit })
  const items = await call(method, creds, params)
  return { ids: items.map((x) => String(x.id)), hasMore: readUpstreamPage(params)?.hasMore }
}

/** Pages 1..pages at `limit`, like the worker. */
async function syncWalk(method: ListMethod, limit: number, pages: number) {
  const ids: string[] = []
  const sizes: number[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const page = await syncPage(method, k, limit)
    ids.push(...page.ids)
    sizes.push(page.ids.length)
    hasMore.push(page.hasMore)
  }
  return { ids, sizes, hasMore }
}

beforeEach(() => {
  _resetCursorPager()
})
afterEach(() => {
  axios.defaults.adapter = realAdapter
})

describe('RampAdapter.capabilities', () => {
  it('declares the documented page_size maximum of 100', () => {
    expect(adapter.capabilities?.maxPageSize).toBe(DOC_MAX)
  })
})

describe.each(LISTS)('$method (GET /developer/v1/$path)', (c) => {
  it('N = 2L + 1: every row once, in order, and page 2 sends start = the last id of page 1', async () => {
    const L = 3
    const rows = c.rows(2 * L + 1)
    fakeRamp(() => ({ [c.path]: rows }))

    const walk = await syncWalk(c.method, L, 3)

    expect(walk.ids).toEqual(rows.map((r) => r.id))
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])

    const reqs = listRequests(c.path)
    expect(reqs).toHaveLength(3)
    expect(reqs.map((r) => r.url.searchParams.get('page_size'))).toEqual(['3', '3', '3'])
    expect(reqs[0]!.url.searchParams.has('start')).toBe(false)
    expect(reqs[1]!.url.searchParams.get('start')).toBe(rows[L - 1]!.id)
    expect(reqs[2]!.url.searchParams.get('start')).toBe(rows[2 * L - 1]!.id)
    // Nothing undocumented reaches the upstream.
    for (const r of reqs) {
      for (const k of r.url.searchParams.keys()) expect(['start', 'page_size']).toContain(k)
    }
  })

  it('pages 2 and 3 request the complete `page.next` URL the page before returned', async () => {
    const L = 2
    const rows = c.rows(5)
    fakeRamp(() => ({ [c.path]: rows }), { opaqueNext: true })

    const walk = await syncWalk(c.method, L, 3)
    expect(walk.ids).toEqual(rows.map((r) => r.id))

    const reqs = listRequests(c.path)
    expect(reqs).toHaveLength(3)
    // The opaque part is there to be lost: rebuilding from `start` drops it.
    expect(reqs[0]!.next).toContain('_sig=')
    expect(reqs[1]!.url.href).toBe(reqs[0]!.next)
    expect(reqs[2]!.url.href).toBe(reqs[1]!.next)
  })

  it('a short page that still has a `next` is not the end of the list', async () => {
    const L = 3
    const rows = c.rows(7)
    fakeRamp(() => ({ [c.path]: rows }), { shortFirstPage: true })

    const walk = await syncWalk(c.method, L, 3)

    expect(walk.ids).toEqual(rows.map((r) => r.id))
    expect(walk.sizes).toEqual([2, 3, 2])
    expect(walk.hasMore).toEqual([true, true, false])
  })

  it('one connection paging this list at two limits at once gets the rows of each', async () => {
    const rows = c.rows(12)
    fakeRamp(() => ({ [c.path]: rows }))
    const ids = (from: number, to: number) => rows.slice(from, to).map((r) => r.id)

    // A sync at 3 and an API caller at 5 on the same list, inside the pager's TTL.
    expect((await syncPage(c.method, 1, 3)).ids).toEqual(ids(0, 3))
    expect((await syncPage(c.method, 2, 3)).ids).toEqual(ids(3, 6))
    expect((await syncPage(c.method, 2, 5)).ids).toEqual(ids(5, 10))
    expect((await syncPage(c.method, 3, 3)).ids).toEqual(ids(6, 9))
  })

  it("a walk of another list on the same connection does not leak into this one's pages", async () => {
    const other = LISTS[(LISTS.indexOf(c) + 1) % LISTS.length]!
    const mine = c.rows(9)
    fakeRamp(() => ({ [c.path]: mine, [other.path]: other.rows(9) }))

    // The sync worker walks resources one after another on one connection.
    await syncWalk(other.method, 3, 2)
    const page2 = await syncPage(c.method, 2, 3)

    expect(page2.ids).toEqual(mine.slice(3, 6).map((r) => r.id))
    expect(page2.hasMore).toBe(true)
  })

  it('an access-token refresh mid-walk resumes the walk instead of starting over', async () => {
    const L = 3
    const rows = c.rows(9)
    fakeRamp(() => ({ [c.path]: rows }))
    // Ramp's refresh "returns a new access token, but not a new refresh token".
    const refreshed = { accessToken: 'tok-a-refreshed', refreshToken: CREDS_A.refreshToken }

    await syncPage(c.method, 1, L, CREDS_A)
    const before = listRequests(c.path).length
    const page2 = await syncPage(c.method, 2, L, refreshed)

    expect(page2.ids).toEqual(rows.slice(L, 2 * L).map((r) => r.id))
    const after = listRequests(c.path).slice(before)
    expect(after).toHaveLength(1)
    expect(after[0]!.token).toBe(refreshed.accessToken)
  })

  it('N = 2L: page 2 ends the list, and page 3 is empty without a request', async () => {
    const L = 4
    const rows = c.rows(2 * L)
    fakeRamp(() => ({ [c.path]: rows }))

    const walk = await syncWalk(c.method, L, 3)

    expect(walk.ids).toEqual(rows.map((r) => r.id))
    expect(walk.sizes).toEqual([L, L, 0])
    expect(walk.hasMore).toEqual([true, false, false])
    expect(listRequests(c.path)).toHaveLength(2)
  })

  it('N = 2L with a `next` on the full last page: page 3 is empty and ends the list', async () => {
    const L = 4
    const rows = c.rows(2 * L)
    fakeRamp(() => ({ [c.path]: rows }), { trailingNext: true })

    const walk = await syncWalk(c.method, L, 3)

    expect(walk.ids).toEqual(rows.map((r) => r.id))
    expect(walk.sizes).toEqual([L, L, 0])
    expect(walk.hasMore).toEqual([true, true, false])
  })

  it('a limit above the documented max is sent as 100 and still serves every row once', async () => {
    const L = 150
    const rows = c.rows(2 * L + 1)
    fakeRamp(() => ({ [c.path]: rows }))

    const walk = await syncWalk(c.method, L, 3)

    expect(walk.ids).toEqual(rows.map((r) => r.id))
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    for (const r of listRequests(c.path)) expect(r.url.searchParams.get('page_size')).toBe('100')
  })

  it('limit 1, below the documented floor of 2, sends 2 and serves one row a page', async () => {
    const L = 1
    const rows = c.rows(2 * L + 1)
    fakeRamp(() => ({ [c.path]: rows }))

    const walk = await syncWalk(c.method, L, 3)

    expect(walk.ids).toEqual(rows.map((r) => r.id))
    expect(walk.sizes).toEqual([1, 1, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    for (const r of listRequests(c.path)) expect(r.url.searchParams.get('page_size')).toBe('2')
  })

  it('pages at the limit parseListQuery delivers, capped at the declared maximum', async () => {
    const rows = c.rows(2 * DOC_MAX + 1)
    fakeRamp(() => ({ [c.path]: rows }))

    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ limit: '500', page: String(k) }, adapter)
      expect(params.limit).toBe(DOC_MAX)
      const items = await call(c.method, CREDS_A, params)
      ids.push(...items.map((x) => String(x.id)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }

    expect(ids).toEqual(rows.map((r) => r.id))
    expect(hasMore).toEqual([true, true, false])
    for (const r of listRequests(c.path)) expect(r.url.searchParams.get('page_size')).toBe('100')
  })

  it('reports meta.hasMore through parseListQuery + listPage', async () => {
    const rows = c.rows(7)
    fakeRamp(() => ({ [c.path]: rows }))

    const ids: string[] = []
    const hasMore: (boolean | null)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = parseListQuery({ limit: '3', page: String(k) }, adapter)
      const env = listPage(await call(c.method, CREDS_A, params), params, 'ramp')
      ids.push(...env.data.map((x) => String(x.id)))
      hasMore.push(env.meta.hasMore)
    }

    expect(ids).toEqual(rows.map((r) => r.id))
    expect(hasMore).toEqual([true, true, false])
  })

  it('two connections walking at once each get their own rows', async () => {
    const L = 2
    const a = c.rows(5, 'a_')
    const b = c.rows(5, 'b_')
    fakeRamp((token) => ({ [c.path]: token === CREDS_A.accessToken ? a : b }))

    const got = { a: [] as string[], b: [] as string[] }
    for (let k = 1; k <= 3; k++) {
      got.a.push(...(await syncPage(c.method, k, L, CREDS_A)).ids)
      got.b.push(...(await syncPage(c.method, k, L, CREDS_B)).ids)
    }

    expect(got.a).toEqual(a.map((r) => r.id))
    expect(got.b).toEqual(b.map((r) => r.id))
  })
})

describe.each(LISTS.filter((c) => c.path in FROM_DATE_FIELD))('$method from_date', (c) => {
  it('updatedAfter reaches every page as from_date, and does not share cursors with the unfiltered walk', async () => {
    const rows = c.rows(12)
    fakeRamp(() => ({ [c.path]: rows }), { opaqueNext: true })
    const L = 3
    const since = new Date(Date.UTC(2026, 0, 5)) // rows 4..11 are after it
    const filtered = rows.filter(
      (r) => Date.parse(String(r[FROM_DATE_FIELD[c.path]!])) > since.getTime(),
    )

    const f1 = withPageSink({ page: 1, limit: L, updatedAfter: since })
    const u1 = withPageSink({ page: 1, limit: L })
    const f2 = withPageSink({ page: 2, limit: L, updatedAfter: since })
    const u2 = withPageSink({ page: 2, limit: L })
    const got = {
      f1: (await call(c.method, CREDS_A, f1)).map((x) => x.id),
      u1: (await call(c.method, CREDS_A, u1)).map((x) => x.id),
      f2: (await call(c.method, CREDS_A, f2)).map((x) => x.id),
      u2: (await call(c.method, CREDS_A, u2)).map((x) => x.id),
    }

    expect(got.f1).toEqual(filtered.slice(0, L).map((r) => r.id))
    expect(got.f2).toEqual(filtered.slice(L, 2 * L).map((r) => r.id))
    expect(got.u1).toEqual(rows.slice(0, L).map((r) => r.id))
    expect(got.u2).toEqual(rows.slice(L, 2 * L).map((r) => r.id))

    const withFilter = listRequests(c.path).filter((r) => r.url.searchParams.has('from_date'))
    expect(withFilter).toHaveLength(2)
    expect(withFilter[1]!.url.searchParams.get('start')).toBe(filtered[L - 1]!.id)
    // Page 2 is the URL Ramp returned, byte for byte: the filter is not sent twice.
    expect(withFilter[1]!.url.href).toBe(withFilter[0]!.next)
    expect(withFilter[1]!.url.searchParams.getAll('from_date')).toHaveLength(1)
  })
})

describe('page.next outside the API', () => {
  const tail = (n: URL) => `${n.pathname}${n.search}`
  it.each([
    ['on another host', (n: URL) => `https://elsewhere.example${tail(n)}`],
    ['over plain http on the API host', (n: URL) => `http://api.ramp.com${tail(n)}`],
    ['on another port of the API host', (n: URL) => `https://api.ramp.com:8443${tail(n)}`],
    ['on the API host outside /developer/v1/', (n: URL) => `${ORIGIN}/other/bills${n.search}`],
    [
      'climbing out of /developer/v1/ by dot segments',
      (n: URL) => `${ORIGIN}${BASE_PATH}../../other/bills${n.search}`,
    ],
  ])('%s is refused, and the connection token is not sent to it', async (_, rewriteNext) => {
    const rows = plain('bill')(5)
    fakeRamp(() => ({ bills: rows }), { rewriteNext })

    await syncPage('listBills', 1, 2)
    await expect(syncPage('listBills', 2, 2)).rejects.toThrow(/outside/)

    // Page 1 is the only request that left.
    expect(seen).toHaveLength(1)
    expect(seen[0]!.url.origin).toBe(ORIGIN)
    expect(seen[0]!.url.pathname).toBe(`${BASE_PATH}bills`)
  })
})

describe('a direct call with no limit', () => {
  it('asks for 100 rows, the most one Ramp page holds', async () => {
    const rows = plain('gl')(150)
    fakeRamp(() => ({ 'accounting/accounts': rows }))

    const params = withPageSink({})
    const items = await adapter.listAccounts(CREDS_A, params)

    expect(items.map((x) => x.id)).toEqual(rows.slice(0, 100).map((r) => r.id))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(listRequests('accounting/accounts')[0]!.url.searchParams.get('page_size')).toBe('100')
  })
})
