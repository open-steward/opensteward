/**
 * Tipalti list paging: every list serves the caller's page `page` at `limit`.
 *
 * Tipalti pages by opaque cursor. Every list endpoint used here
 * (GET /api/v1/invoices, /payees, /gl-accounts, /payments, /tax-codes)
 * documents the query parameters `filter`, `page-size` and `page-cursor`
 * (e.g. https://documentation.tipalti.com/reference/get_api-v1-invoices):
 *   page-cursor: "A cursor for pagination across multiple pages of results."
 *   nextPageCursor: "Page cursor to use on the next API request call to
 *     retrieve next items."
 * and answers { totalCount, pageInfo: { hasNextPage, nextPageCursor }, items }.
 * The pagination guide (https://documentation.tipalti.com/reference/pagination-1)
 * gives the size "Default value: 100 Maximum value: 200", and totalCount as
 * "Total count of items of a resource type or as requested when using a filter".
 *
 * The adapter used to read `params.cursor`, which the router never sets, so
 * page 2 of every list was page 1 again.
 *
 * The fake upstream below honours ONLY the documented parameters: `page-size`
 * (default 100, above 200 refused with a 400) and `page-cursor` (a position in
 * one list; another list's cursor is refused). Every other parameter is
 * ignored, as on the real API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { TipaltiAdapter } from '../../../../../../src/verticals/accounting/adapters/tipalti/index'

const CREDS = {
  accessToken: 'tipalti-access',
  extra: { clientId: 'client-a', clientSecret: 'secret-a', environment: 'sandbox' },
}

const adapter = new TipaltiAdapter()

// ── the fake upstream ────────────────────────────────────────────────────

const DOCUMENTED_DEFAULT = 100
const DOCUMENTED_MAX = 200

interface Recorded {
  url: string
  params: Record<string, unknown>
}

interface Row {
  id: string
  invoiceNumber?: string
}

interface Dataset {
  /** Rows per list path. */
  rows: Record<string, number>
  /** Answer the last page with a non-null nextPageCursor while hasNextPage is false. */
  cursorOnLastPage?: boolean
  /** Leave out totalCount, which the guide defines only "as requested when using a filter". */
  omitTotalCount?: boolean
  /**
   * How a page that is NOT the last answers pageInfo (nullable in the spec):
   * 'null' sends `pageInfo: null`, 'no-cursor' sends hasNextPage true with a
   * null nextPageCursor.
   */
  morePageInfo?: 'null' | 'no-cursor'
  /** Answer the last page with `pageInfo: null`. */
  lastPageInfoNull?: boolean
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), {
    response: { status: 400, data: { errorCode: 'GNRL-100001', message } },
  })
}

function encodeCursor(path: string, offset: number): string {
  return Buffer.from(JSON.stringify({ path, offset })).toString('base64')
}

function decodeCursor(path: string, cursor: unknown): number {
  if (cursor === undefined) return 0
  let parsed: { path?: unknown; offset?: unknown }
  try {
    parsed = JSON.parse(Buffer.from(String(cursor), 'base64').toString('utf8')) as typeof parsed
  } catch {
    throw badRequest(`invalid page-cursor ${String(cursor)}`)
  }
  // A cursor is a position in ONE list: another endpoint's cursor is refused.
  if (parsed.path !== path || typeof parsed.offset !== 'number')
    throw badRequest(`page-cursor for ${String(parsed.path)} sent to ${path}`)
  return parsed.offset
}

const PREFIX: Record<string, string> = {
  '/invoices': 'inv_',
  '/payees': 'payee_',
  '/gl-accounts': 'gl_',
  '/payments': 'pay_',
  '/tax-codes': 'tax_',
}

function fakeUpstream(data: Dataset): Recorded[] {
  const requests: Recorded[] = []
  const get = async (url: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    requests.push({ url, params })
    const prefix = PREFIX[url]
    if (prefix === undefined) throw new Error(`fake upstream: no route for ${url}`)
    const rows: Row[] = Array.from({ length: data.rows[url] ?? 0 }, (_, i) => ({
      id: `${prefix}${i}`,
      ...(url === '/invoices' ? { invoiceNumber: `N-${i}` } : {}),
    }))
    const raw = params['page-size']
    const size = raw === undefined ? DOCUMENTED_DEFAULT : Number(raw)
    if (!Number.isInteger(size) || size < 1) throw badRequest(`page-size ${String(raw)}`)
    if (size > DOCUMENTED_MAX)
      throw badRequest(
        `The parameter 'pageSize' is invalid. 'pageSize' must be less than or equal to '${DOCUMENTED_MAX}'.`,
      )
    const offset = decodeCursor(url, params['page-cursor'])
    const items = rows.slice(offset, offset + size)
    const end = offset + items.length
    const more = end < rows.length
    let pageInfo: { hasNextPage: boolean; nextPageCursor: string | null } | null = {
      hasNextPage: more,
      nextPageCursor: more || data.cursorOnLastPage ? encodeCursor(url, end) : null,
    }
    if (more && data.morePageInfo === 'null') pageInfo = null
    if (more && data.morePageInfo === 'no-cursor')
      pageInfo = { hasNextPage: true, nextPageCursor: null }
    if (!more && data.lastPageInfoNull) pageInfo = null
    return {
      data: {
        ...(data.omitTotalCount ? {} : { totalCount: rows.length }),
        pageInfo,
        items,
      },
    }
  }
  vi.spyOn(axios, 'create').mockImplementation((() => ({ get })) as unknown as typeof axios.create)
  return requests
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

// ── driving the adapter like the worker ──────────────────────────────────

type ListMethod =
  | 'listInvoices'
  | 'listBills'
  | 'listContacts'
  | 'listAccounts'
  | 'listTransactions'
  | 'listTaxRates'

/**
 * A row of any list above. `adapter[c.method]` returns a union of arrays
 * (Invoice[] | Bill[] | …), from which `listPage<T>(items: T[])` cannot infer
 * one T, so the envelope is typed over the union of the rows themselves —
 * which every method's array is still checked against.
 */
type ListRow = Awaited<ReturnType<TipaltiAdapter[ListMethod]>>[number]

async function drive(
  method: ListMethod,
  limit: number,
  pages: number,
  creds: typeof CREDS = CREDS,
  extra: Partial<QueryParams> = {},
) {
  const served: string[][] = []
  const hasMore: Array<boolean | undefined> = []
  const totalCount: Array<number | undefined> = []
  const pageSize: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params: QueryParams = withPageSink({ page, limit, ...extra })
    const rows = (await adapter[method](creds, params)) as Array<{ id?: string }>
    served.push(rows.map((r) => String(r.id)))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    totalCount.push(meta?.totalCount)
    pageSize.push(meta?.pageSize)
  }
  return { served, hasMore, totalCount, pageSize }
}

const seq = (prefix: string, n: number, from = 0): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${from + i}`)

const onPath = (requests: Recorded[], url: string): Recorded[] =>
  requests.filter((r) => r.url === url)

// ── every list ───────────────────────────────────────────────────────────

interface Case {
  method: ListMethod
  path: string
}

const CASES: Case[] = [
  { method: 'listInvoices', path: '/invoices' },
  { method: 'listBills', path: '/invoices' },
  { method: 'listContacts', path: '/payees' },
  { method: 'listAccounts', path: '/gl-accounts' },
  { method: 'listTransactions', path: '/payments' },
  { method: 'listTaxRates', path: '/tax-codes' },
]

describe.each(CASES)('TipaltiAdapter.$method pages by page-cursor', (c) => {
  const prefix = PREFIX[c.path]!
  const data = (n: number, more: Partial<Dataset> = {}): Dataset => ({
    rows: { [c.path]: n },
    ...more,
  })

  it('serves 2L + 1 rows once each across pages 1..3, and reports the end', async () => {
    const L = 3
    const N = 2 * L + 1
    const requests = fakeUpstream(data(N))
    const { served, hasMore, totalCount, pageSize } = await drive(c.method, L, 3)
    expect(served).toEqual([seq(prefix, L), seq(prefix, L, L), seq(prefix, 1, 2 * L)])
    expect(served.flat()).toEqual(seq(prefix, N))
    expect(hasMore).toEqual([true, true, false])
    expect(totalCount).toEqual([N, N, N])
    expect(pageSize).toEqual([undefined, undefined, undefined])
    // A sequential walk costs one request per page.
    expect(onPath(requests, c.path)).toHaveLength(3)
  })

  it("sends page 1's nextPageCursor as `page-cursor` on page 2, at the caller's limit", async () => {
    const requests = fakeUpstream(data(7))
    await drive(c.method, 3, 2)
    const calls = onPath(requests, c.path)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params['page-size']).toBe(3)
    expect(calls[0]!.params['page-cursor']).toBeUndefined()
    expect(calls[1]!.params['page-size']).toBe(3)
    expect(calls[1]!.params['page-cursor']).toBe(encodeCursor(c.path, 3))
  })

  it('ends on page 2 when N = 2L, and serves page 3 empty without a request', async () => {
    const L = 3
    const requests = fakeUpstream(data(2 * L))
    const { served, hasMore } = await drive(c.method, L, 3)
    expect(served.flat()).toEqual(seq(prefix, 2 * L))
    expect(served[2]).toEqual([])
    expect(hasMore).toEqual([true, false, false])
    expect(onPath(requests, c.path)).toHaveLength(2)
  })

  it('ends where hasNextPage is false even if the last page still carries a cursor', async () => {
    const L = 3
    const requests = fakeUpstream(data(2 * L + 1, { cursorOnLastPage: true }))
    const { served, hasMore } = await drive(c.method, L, 4)
    expect(served.flat()).toEqual(seq(prefix, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false, false])
    expect(onPath(requests, c.path)).toHaveLength(3)
  })

  it('clamps a limit above the documented 200 and still serves every row, reporting the size sent', async () => {
    const N = 2 * DOCUMENTED_MAX + 1
    const requests = fakeUpstream(data(N))
    const { served, hasMore, pageSize } = await drive(c.method, 500, 3)
    expect(served.map((p) => p.length)).toEqual([200, 200, 1])
    expect(served.flat()).toEqual(seq(prefix, N))
    expect(hasMore).toEqual([true, true, false])
    expect(pageSize).toEqual([200, 200, 200])
    for (const r of onPath(requests, c.path)) expect(r.params['page-size']).toBe(200)
  })

  it('pages at the limit parseListQuery delivers, capped at the declared maximum', async () => {
    const requests = fakeUpstream(data(2 * DOCUMENTED_MAX + 1))
    const page1 = parseListQuery({ limit: '500' }, adapter)
    const page2 = parseListQuery({ limit: '500', page: '2' }, adapter)
    expect(page1.limit).toBe(DOCUMENTED_MAX)
    const rows1 = await adapter[c.method](CREDS, page1)
    const rows2 = await adapter[c.method](CREDS, page2)
    expect(rows1.map((r) => r.id)).toEqual(seq(prefix, 200))
    expect(rows2.map((r) => r.id)).toEqual(seq(prefix, 200, 200))
    for (const r of onPath(requests, c.path)) expect(r.params['page-size']).toBe(200)
  })

  it('reports meta.hasMore and meta.totalCount through parseListQuery + listPage', async () => {
    fakeUpstream(data(5))
    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter)
    const env1 = listPage<ListRow>(await adapter[c.method](CREDS, p1), p1, 'tipalti')
    expect(env1.data.map((r) => r.id)).toEqual(seq(prefix, 2))
    expect(env1.meta.hasMore).toBe(true)
    expect(env1.meta.totalCount).toBe(5)

    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const env3 = listPage<ListRow>(await adapter[c.method](CREDS, p3), p3, 'tipalti')
    expect(env3.data.map((r) => r.id)).toEqual(seq(prefix, 1, 4))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('reports meta.hasMore through listPage from hasNextPage when no totalCount comes back', async () => {
    fakeUpstream(data(4, { omitTotalCount: true }))
    // Both pages are full, so only the adapter's reported flag can decide them.
    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter)
    const env1 = listPage<ListRow>(await adapter[c.method](CREDS, p1), p1, 'tipalti')
    expect(env1.data.map((r) => r.id)).toEqual(seq(prefix, 2))
    expect(env1.meta.hasMore).toBe(true)
    expect(env1.meta.totalCount).toBeNull()

    const p2 = parseListQuery({ limit: '2', page: '2' }, adapter)
    const env2 = listPage<ListRow>(await adapter[c.method](CREDS, p2), p2, 'tipalti')
    expect(env2.data.map((r) => r.id)).toEqual(seq(prefix, 2, 2))
    expect(env2.meta.hasMore).toBe(false)
  })

  it('keeps one connection’s walk apart from another’s on the same OAuth client', async () => {
    const requests = fakeUpstream(data(7))
    await adapter[c.method](CREDS, withPageSink({ page: 1, limit: 3 }))
    // Same environment and clientId: only the connection's token tells them apart.
    const other = { ...CREDS, accessToken: 'other-access' }
    const rows = await adapter[c.method](other, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(seq(prefix, 3, 3))
    // The second connection walks its own chain from page 1.
    const calls = onPath(requests, c.path)
    expect(calls).toHaveLength(3)
    expect(calls[1]!.params['page-cursor']).toBeUndefined()
    expect(calls[2]!.params['page-cursor']).toBe(encodeCursor(c.path, 3))
  })

  it('does not carry a cursor from a walk at one limit into a page at another', async () => {
    const requests = fakeUpstream(data(12))
    await adapter[c.method](CREDS, withPageSink({ page: 1, limit: 3 }))
    const rows = await adapter[c.method](CREDS, withPageSink({ page: 2, limit: 5 }))
    // Page 2 at limit 5 is rows 5..9, not the rows after page 1 at limit 3.
    expect(rows.map((r) => r.id)).toEqual(seq(prefix, 5, 5))
    const calls = onPath(requests, c.path)
    expect(calls).toHaveLength(3)
    expect(calls[1]!.params).toMatchObject({ 'page-size': 5 })
    expect(calls[1]!.params['page-cursor']).toBeUndefined()
    expect(calls[2]!.params).toMatchObject({
      'page-size': 5,
      'page-cursor': encodeCursor(c.path, 5),
    })
  })

  it('does not carry another list’s cursor into this one', async () => {
    const other: Case =
      c.path === '/payees'
        ? { method: 'listTaxRates', path: '/tax-codes' }
        : { method: 'listContacts', path: '/payees' }
    const requests = fakeUpstream({ rows: { [c.path]: 7, [other.path]: 7 } })
    await adapter[other.method](CREDS, withPageSink({ page: 1, limit: 3 }))
    const rows = await adapter[c.method](CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(seq(prefix, 3, 3))
    const calls = onPath(requests, c.path)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params['page-cursor']).toBeUndefined()
    expect(calls[1]!.params['page-cursor']).toBe(encodeCursor(c.path, 3))
  })

  it('sends the documented default page-size when no limit is given', async () => {
    const requests = fakeUpstream(data(3))
    const rows = await adapter[c.method](CREDS, withPageSink({ page: 1 }))
    expect(rows.map((r) => r.id)).toEqual(seq(prefix, 3))
    expect(onPath(requests, c.path)[0]!.params['page-size']).toBe(DOCUMENTED_DEFAULT)
  })

  it('throws rather than end the walk when hasNextPage is true with no nextPageCursor', async () => {
    // No totalCount either, so hasNextPage alone has to say there is more.
    fakeUpstream(data(7, { morePageInfo: 'no-cursor', omitTotalCount: true }))
    const params = withPageSink({ page: 1, limit: 3 })
    await expect(adapter[c.method](CREDS, params)).rejects.toThrow(
      `Tipalti: ${c.path} reported more rows (hasNextPage true, totalCount undefined, 3 served) with no nextPageCursor to continue from`,
    )
    // Nothing told the worker this was the end.
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('throws when pageInfo is missing and totalCount counts rows past the page', async () => {
    fakeUpstream(data(7, { morePageInfo: 'null' }))
    await expect(adapter[c.method](CREDS, withPageSink({ page: 1, limit: 3 }))).rejects.toThrow(
      /hasNextPage undefined, totalCount 7, 3 served\) with no nextPageCursor/,
    )
  })

  it('ends at a missing pageInfo once totalCount rows have been walked', async () => {
    const L = 3
    const N = 2 * L + 1
    const requests = fakeUpstream(data(N, { lastPageInfoNull: true }))
    // Page 3 is 1 row, but 7 rows have been walked in all: it is the end.
    const { served, hasMore } = await drive(c.method, L, 4)
    expect(served.flat()).toEqual(seq(prefix, N))
    expect(hasMore).toEqual([true, true, false, false])
    expect(onPath(requests, c.path)).toHaveLength(3)
  })

  it('reads a page with neither pageInfo nor totalCount as the only page', async () => {
    fakeUpstream(data(2, { lastPageInfoNull: true, omitTotalCount: true }))
    const { served, hasMore } = await drive(c.method, 3, 1)
    expect(served).toEqual([seq(prefix, 2)])
    expect(hasMore).toEqual([false])
  })
})

describe('TipaltiAdapter invoice-wire lists', () => {
  it('maps /invoices rows to Bills in listBills and to Invoices in listInvoices', async () => {
    fakeUpstream({ rows: { '/invoices': 4 } })
    const bills = await adapter.listBills(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(bills.map((b) => b.billNumber)).toEqual(['N-2', 'N-3'])
    expect(bills[0]).not.toHaveProperty('invoiceNumber')
    const invoices = await adapter.listInvoices(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(invoices.map((i) => i.invoiceNumber)).toEqual(['N-2', 'N-3'])
    expect(invoices[0]).not.toHaveProperty('billNumber')
  })
})

describe('TipaltiAdapter list keys', () => {
  it('does not carry a cursor from one updatedAfter walk into another', async () => {
    const requests = fakeUpstream({ rows: { '/invoices': 7 } })
    await drive('listInvoices', 3, 1, CREDS, { updatedAfter: new Date('2026-01-01T00:00:00Z') })
    await adapter.listInvoices(
      CREDS,
      withPageSink({ page: 2, limit: 3, updatedAfter: new Date('2026-02-01T00:00:00Z') }),
    )
    const calls = onPath(requests, '/invoices')
    // Page 2 under a new filter walks from page 1 rather than reusing a cursor.
    expect(calls).toHaveLength(3)
    expect(calls[1]!.params['page-cursor']).toBeUndefined()
  })

  it('declares the documented page maximum', () => {
    expect(adapter.capabilities?.maxPageSize).toBe(DOCUMENTED_MAX)
  })
})
