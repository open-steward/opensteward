/**
 * Brex list paging: every list serves the caller's page `page` at `limit`.
 *
 * Brex pages by opaque cursor. The pagination guide
 * (https://developer.brex.com/guides/pagination.md):
 *   "The response will contain an array of items and a `next_cursor`, which
 *    can be passed back in as cursor to fetch the next set of items. The
 *    `next_cursor` is `nil` once the end of the set is reached."
 *   limit: "It can be set to a number up to 1000. When it is set to a value
 *    greater than 1000, a 400 Bad Request error will be returned."
 * Two endpoints document a lower ceiling:
 *   GET /v1/expenses/card (listexpenses_1.md), limit: "can't be greater than 100"
 *   GET /v3/accounting/records (queryaccountingrecords.md), limit: "The maximum
 *     is 500; requests with a higher value are rejected with a 400 error."
 * And one documents no parameters at all:
 *   GET /v2/accounts/cash (listaccounts.md): "This endpoint lists all the
 *     existing cash accounts with their status."
 *
 * The adapter used to read `params.cursor`, which the router never sets, so
 * page 2 of every list was page 1 again. Transactions also sent one caller
 * cursor to the card list and to every cash account's list, and returned up
 * to `limit` rows from each of them on one page.
 *
 * The fake upstream below honours ONLY the documented parameters of each
 * endpoint: `cursor` and `limit`, and the documented filters `source_type`,
 * `updated_at[gte]` (records), `updated_at_start` (card expenses) and
 * `posted_at_start` (transactions), with each endpoint's own maximum enforced
 * as a 400, and every other parameter ignored, as on the real API. A cursor
 * is a position in ONE list, and each connection sees its own rows.
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
import { BrexAdapter } from '../../../../../../src/verticals/accounting/adapters/brex/index'

const CREDS = { accessToken: 'brex-access', refreshToken: 'brex-refresh' }
const OTHER = { accessToken: 'other-access', refreshToken: 'other-refresh' }
const MAIN_AUTH = `Bearer ${CREDS.accessToken}`
const OTHER_AUTH = `Bearer ${OTHER.accessToken}`

const adapter = new BrexAdapter({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://example.test/callback',
})

// ── the fake upstream ────────────────────────────────────────────────────

interface Recorded {
  url: string
  params: Record<string, unknown>
  /** The Authorization header the request went out with. */
  auth: string
}

interface Dataset {
  vendors?: number
  expenses?: number
  /** Accounting records with source_type BILL; CARD records are interleaved between them. */
  bills?: number
  /** Cash accounts, in the order the list returns them. */
  accounts?: number
  cardTxns?: number
  /** Cash transactions per cash account id, in account-list order. */
  cashTxns?: Record<string, number>
  /** Answer the last full page with a cursor anyway, which then fetches an empty page. */
  trailingCursor?: boolean
  /** What `next_cursor` is at the end of a list (the cash-account list too): `null`, or an empty string. */
  endCursor?: null | ''
  /**
   * What a cursor means. 'offset' (the default): a row position, the same at
   * any `limit`. 'page': a page index, so the rows it names depend on the
   * `limit` sent with it. The docs say neither.
   */
  cursorModel?: 'offset' | 'page'
  /** On this path, a page fetched with a cursor names that same cursor as its next_cursor. */
  cursorLoopsOn?: string
  /** GET /v3/accounting/records keeps a next_cursor on its last page, with has_next_page false. */
  recordsCursorAtEnd?: boolean
  /** Split the cash-account list over this many next_cursor pages (not documented; default 1). */
  accountsPages?: number
  /**
   * The cash-account list answers every page with the same next_cursor:
   * 'same-page' with the same accounts (it ignores `cursor`), 'new-accounts'
   * with one more account each time (it never ends).
   */
  accountsCursorLoops?: 'same-page' | 'new-accounts'
  /** The cash-account list answers its first call with no accounts and a next_cursor to the rest. */
  accountsFirstPageEmpty?: boolean
}

interface Row {
  id: string
  [key: string]: unknown
}

const DOCUMENTED_MAX: Record<string, number> = {
  '/v1/vendors': 1000,
  '/v1/expenses/card': 100,
  '/v3/accounting/records': 500,
  '/v2/transactions/card/primary': 1000,
  '/v2/transactions/cash': 1000,
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { response: { status: 400, data: { message } } })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { response: { status: 404, data: { message } } })
}

/** A cursor naming position `at` (a row offset, or a page index) in the list at `path`. */
function encodeCursor(path: string, at: number): string {
  return Buffer.from(JSON.stringify({ path, offset: at })).toString('base64url')
}

function decodeCursor(path: string, cursor: unknown): number {
  if (cursor === undefined) return 0
  let parsed: { path?: unknown; offset?: unknown }
  try {
    parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8')) as typeof parsed
  } catch {
    throw badRequest(`invalid cursor ${String(cursor)}`)
  }
  // A cursor is a position in ONE list: another endpoint's cursor is refused.
  if (parsed.path !== path || typeof parsed.offset !== 'number')
    throw badRequest(`cursor for ${String(parsed.path)} sent to ${path}`)
  return parsed.offset
}

const day = (i: number): string => new Date(Date.UTC(2026, 0, 1 + i)).toISOString()

function vendorRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: `ven_${i}`, company_name: `Vendor ${i}` }))
}
function expenseRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `exp_${i}`,
    memo: `Expense ${i}`,
    updated_at: day(i),
  }))
}
/** Every BILL record follows a CARD record, so a list without source_type=BILL shows it. */
function accountingRows(bills: number): Row[] {
  return Array.from({ length: bills }, (_, i) => [
    { id: `card_rec_${i}`, source_type: 'CARD', type: 'CARD_EXPENSE', updated_at: day(i) },
    { id: `accr_${i}`, source_type: 'BILL', type: 'BILL_EXPENSE', updated_at: day(i) },
  ]).flat()
}
function accountRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `cash_acc_${i}`,
    description: `Account ${i}`,
    status: 'ACTIVE',
  }))
}
function cardTxnRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: `card_${i}`, posted_at_date: day(i) }))
}
function cashTxnRows(account: string, n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${account}_txn_${i}`,
    posted_at_date: day(i),
  }))
}

/** Rows from `since` on, by `field`; every row when `since` is absent. */
function onOrAfter(rows: Row[], field: string, since: unknown): Row[] {
  return since === undefined ? rows : rows.filter((r) => String(r[field]) >= String(since))
}

/** One page of a cursor list, the way Brex answers it. */
function cursorPage(
  path: string,
  maxKey: string,
  rows: Row[],
  params: Record<string, unknown>,
  data: Dataset,
): Record<string, unknown> {
  const max = DOCUMENTED_MAX[maxKey]!
  const limit = params['limit'] === undefined ? 100 : Number(params['limit'])
  if (!Number.isInteger(limit) || limit < 1) throw badRequest(`limit ${String(params['limit'])}`)
  if (limit > max) throw badRequest(`limit ${limit} is greater than ${max}`)
  const at = decodeCursor(path, params['cursor'])
  const byPage = data.cursorModel === 'page'
  const offset = byPage ? at * limit : at
  const items = rows.slice(offset, offset + limit)
  const end = offset + items.length
  if (data.cursorLoopsOn === path && params['cursor'] !== undefined)
    return { items, next_cursor: params['cursor'] }
  const more = data.trailingCursor ? items.length === limit : end < rows.length
  return {
    items,
    next_cursor: more ? encodeCursor(path, byPage ? at + 1 : end) : (data.endCursor ?? null),
  }
}

function fakeUpstream(data: Dataset): Recorded[] {
  const requests: Recorded[] = []
  const accounts = accountRows(data.accounts ?? 0)
  let accountCalls = 0
  const answer = (url: string, params: Record<string, unknown>): Record<string, unknown> => {
    if (url === '/v1/vendors')
      return cursorPage(url, url, vendorRows(data.vendors ?? 0), params, data)
    if (url === '/v1/expenses/card') {
      const rows = onOrAfter(
        expenseRows(data.expenses ?? 0),
        'updated_at',
        params['updated_at_start'],
      )
      return cursorPage(url, url, rows, params, data)
    }
    if (url === '/v3/accounting/records') {
      const source = params['source_type']
      let rows = accountingRows(data.bills ?? 0)
      if (source !== undefined) rows = rows.filter((r) => r['source_type'] === source)
      rows = onOrAfter(rows, 'updated_at', params['updated_at[gte]'])
      const page = cursorPage(url, url, rows, params, data)
      const hasNext = !!page['next_cursor']
      if (data.recordsCursorAtEnd && !hasNext) page['next_cursor'] = encodeCursor(url, rows.length)
      return { ...page, has_next_page: hasNext, total_count: rows.length }
    }
    if (url === '/v2/accounts/cash') {
      // No documented parameters: every call answers with every account.
      accountCalls++
      if (data.accountsFirstPageEmpty)
        return params['cursor'] === undefined
          ? { items: [], next_cursor: encodeCursor(url, 0) }
          : { items: accounts, next_cursor: null }
      if (data.accountsCursorLoops === 'same-page')
        return { items: accounts, next_cursor: encodeCursor(url, 0) }
      if (data.accountsCursorLoops === 'new-accounts') {
        // One more account per call, capped so a guard that fails cannot hang the run.
        const extra = accountRows(Math.min(accountCalls, 20)).map((a) => ({
          ...a,
          id: `new_${a.id}`,
        }))
        return { items: [...accounts, ...extra], next_cursor: encodeCursor(url, 0) }
      }
      const pages = data.accountsPages ?? 1
      if (pages === 1) return { items: accounts, next_cursor: data.endCursor ?? null }
      // The response schema still has next_cursor; split the list into `pages`.
      const size = Math.ceil(accounts.length / pages)
      const offset = decodeCursor(url, params['cursor'])
      const end = Math.min(offset + size, accounts.length)
      return {
        items: accounts.slice(offset, end),
        next_cursor: end < accounts.length ? encodeCursor(url, end) : (data.endCursor ?? null),
      }
    }
    const account = /^\/v2\/accounts\/cash\/([^/]+)$/.exec(url)
    if (account) {
      const found = accounts.find((a) => a.id === decodeURIComponent(account[1]!))
      if (!found) throw notFound(`no cash account ${account[1]!}`)
      return found
    }
    const since = params['posted_at_start']
    if (url === '/v2/transactions/card/primary') {
      const rows = onOrAfter(cardTxnRows(data.cardTxns ?? 0), 'posted_at_date', since)
      return cursorPage(url, url, rows, params, data)
    }
    const cash = /^\/v2\/transactions\/cash\/([^/]+)$/.exec(url)
    if (cash) {
      const id = cash[1]!
      if (!accounts.some((a) => a.id === id)) throw badRequest(`no cash account ${id}`)
      const rows = onOrAfter(cashTxnRows(id, data.cashTxns?.[id] ?? 0), 'posted_at_date', since)
      return cursorPage(url, '/v2/transactions/cash', rows, params, data)
    }
    throw new Error(`fake upstream: no route for ${url}`)
  }
  vi.spyOn(axios, 'create').mockImplementation(((config?: { headers?: Record<string, string> }) => {
    const auth = String(config?.headers?.['Authorization'])
    // Another connection sees its own rows: their ids carry its token.
    const tag = auth === MAIN_AUTH ? '' : `${auth.slice('Bearer '.length)}:`
    const get = async (url: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ url, params, auth })
      const body = answer(url, params)
      if (!tag || !Array.isArray(body['items']) || url === '/v2/accounts/cash')
        return { data: body }
      const items = (body['items'] as Row[]).map((r) => ({ ...r, id: `${tag}${r.id}` }))
      return { data: { ...body, items } }
    }
    return { get }
  }) as unknown as typeof axios.create)
  return requests
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

// ── driving the adapter like the worker ──────────────────────────────────

type ListMethod =
  'listBills' | 'listContacts' | 'listExpenses' | 'listAccounts' | 'listTransactions'

/** The rows of one list page, typed only as far as the id every row has. */
async function list(
  method: ListMethod,
  params: QueryParams,
  credentials = CREDS,
): Promise<Array<{ id?: string }>> {
  return adapter[method](credentials, params)
}

const ids = (rows: Array<{ id?: string }>): string[] => rows.map((r) => String(r.id))

async function drive(method: ListMethod, limit: number, pages: number) {
  const served: string[][] = []
  const hasMore: Array<boolean | undefined> = []
  const pageSize: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params: QueryParams = withPageSink({ page, limit })
    served.push(ids(await list(method, params)))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    pageSize.push(meta?.pageSize)
  }
  return { served, hasMore, pageSize }
}

const seq = (prefix: string, n: number, from = 0): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${from + i}`)

const onPath = (requests: Recorded[], url: string): Recorded[] =>
  requests.filter((r) => r.url === url)

// ── the three single-cursor lists ────────────────────────────────────────

interface CursorCase {
  method: 'listBills' | 'listContacts' | 'listExpenses'
  path: string
  data: (n: number) => Dataset
  prefix: string
  max: number
  /** Documented filters every request of this list carries. */
  filters: Record<string, unknown>
}

const CURSOR_CASES: CursorCase[] = [
  {
    method: 'listBills',
    path: '/v3/accounting/records',
    data: (n) => ({ bills: n }),
    prefix: 'accr_',
    max: 500,
    filters: { source_type: 'BILL' },
  },
  {
    method: 'listContacts',
    path: '/v1/vendors',
    data: (n) => ({ vendors: n }),
    prefix: 'ven_',
    max: 1000,
    filters: {},
  },
  {
    method: 'listExpenses',
    path: '/v1/expenses/card',
    data: (n) => ({ expenses: n }),
    prefix: 'exp_',
    max: 100,
    filters: {},
  },
]

describe.each(CURSOR_CASES)('BrexAdapter.$method pages by next_cursor', (c) => {
  it('serves 2L + 1 rows once each across pages 1..3, and reports the end', async () => {
    const L = 3
    const N = 2 * L + 1
    fakeUpstream(c.data(N))
    const { served, hasMore, pageSize } = await drive(c.method, L, 3)
    expect(served).toEqual([seq(c.prefix, L), seq(c.prefix, L, L), seq(c.prefix, 1, 2 * L)])
    expect(served.flat()).toEqual(seq(c.prefix, N))
    expect(hasMore).toEqual([true, true, false])
    expect(pageSize).toEqual([undefined, undefined, undefined])
  })

  it("sends page 1's next_cursor as `cursor` on page 2, at the caller's limit", async () => {
    const requests = fakeUpstream(c.data(7))
    await drive(c.method, 3, 2)
    const calls = onPath(requests, c.path)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params).toEqual({ limit: 3, ...c.filters })
    expect(calls[1]!.params).toEqual({ limit: 3, cursor: encodeCursor(c.path, 3), ...c.filters })
  })

  it('ends on page 2 when N = 2L, and serves page 3 empty without a request', async () => {
    const L = 3
    const requests = fakeUpstream(c.data(2 * L))
    const { served, hasMore } = await drive(c.method, L, 3)
    expect(served.flat()).toEqual(seq(c.prefix, 2 * L))
    expect(served[2]).toEqual([])
    expect(hasMore).toEqual([true, false, false])
    expect(onPath(requests, c.path)).toHaveLength(2)
  })

  it('ends on the empty page when the last full page still carries a cursor', async () => {
    const L = 3
    fakeUpstream({ ...c.data(2 * L), trailingCursor: true })
    const { served, hasMore } = await drive(c.method, L, 3)
    expect(served.flat()).toEqual(seq(c.prefix, 2 * L))
    expect(hasMore).toEqual([true, true, false])
  })

  it('reads an empty-string next_cursor as the end, like null', async () => {
    const L = 3
    const requests = fakeUpstream({ ...c.data(2 * L + 1), endCursor: '' })
    const { served, hasMore } = await drive(c.method, L, 4)
    expect(served.flat()).toEqual(seq(c.prefix, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false, false])
    expect(onPath(requests, c.path)).toHaveLength(3)
  })

  it('clamps a limit above the documented maximum, reports the size it sent, and serves every row', async () => {
    const asked = c.max + 1
    const N = 2 * c.max + 1
    const requests = fakeUpstream(c.data(N))
    const { served, hasMore, pageSize } = await drive(c.method, asked, 3)
    expect(served.map((p) => p.length)).toEqual([c.max, c.max, 1])
    expect(served.flat()).toEqual(seq(c.prefix, N))
    expect(hasMore).toEqual([true, true, false])
    expect(pageSize).toEqual([c.max, c.max, c.max])
    for (const r of onPath(requests, c.path)) expect(r.params['limit']).toBe(c.max)
  })

  it('pages at the limit parseListQuery delivers, capped at the declared maximum', async () => {
    const requests = fakeUpstream(c.data(250))
    const page1 = parseListQuery({ limit: '250' }, adapter)
    const page2 = parseListQuery({ limit: '250', page: '2' }, adapter)
    expect(page1.limit).toBe(100)
    expect(ids(await list(c.method, page1))).toEqual(seq(c.prefix, 100))
    expect(ids(await list(c.method, page2))).toEqual(seq(c.prefix, 100, 100))
    for (const r of onPath(requests, c.path)) expect(r.params['limit']).toBe(100)
  })

  it('reports meta.hasMore through parseListQuery + listPage', async () => {
    fakeUpstream(c.data(5))
    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter)
    const env1 = listPage(await list(c.method, p1), p1, 'brex')
    expect(ids(env1.data)).toEqual(seq(c.prefix, 2))
    expect(env1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const env3 = listPage(await list(c.method, p3), p3, 'brex')
    expect(ids(env3.data)).toEqual(seq(c.prefix, 1, 4))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('keeps one connection’s walk apart from another’s', async () => {
    const requests = fakeUpstream(c.data(7))
    await list(c.method, withPageSink({ page: 1, limit: 3 }))
    const rows = await list(c.method, withPageSink({ page: 2, limit: 3 }), OTHER)
    expect(ids(rows)).toEqual(seq(`other-access:${c.prefix}`, 3, 3))
    // The second connection walks its own chain from page 1, with its own token.
    const calls = onPath(requests, c.path)
    expect(calls).toHaveLength(3)
    expect(calls.map((r) => r.auth)).toEqual([MAIN_AUTH, OTHER_AUTH, OTHER_AUTH])
    expect(calls[1]!.params['cursor']).toBeUndefined()
    expect(calls[2]!.params['cursor']).toBe(encodeCursor(c.path, 3))
  })

  it('keeps a walk at one limit apart from a walk at another', async () => {
    const requests = fakeUpstream(c.data(20))
    await list(c.method, withPageSink({ page: 1, limit: 3 }))
    const rows = await list(c.method, withPageSink({ page: 2, limit: 5 }))
    expect(ids(rows)).toEqual(seq(c.prefix, 5, 5))
    expect(onPath(requests, c.path).map((r) => r.params['cursor'])).toEqual([
      undefined,
      undefined,
      encodeCursor(c.path, 5),
    ])
  })

  it('throws rather than serve one page forever when a next_cursor names the cursor it was sent', async () => {
    fakeUpstream({ ...c.data(9), cursorLoopsOn: c.path })
    await list(c.method, withPageSink({ page: 1, limit: 3 }))
    await expect(list(c.method, withPageSink({ page: 2, limit: 3 }))).rejects.toThrow(
      /returned the cursor it was sent as its next_cursor; following it would loop/,
    )
  })
})

describe('BrexAdapter single-cursor lists keep each list’s walk apart', () => {
  it('pages expenses from their own first page after a vendors walk at the same limit', async () => {
    const requests = fakeUpstream({ vendors: 9, expenses: 9 })
    await list('listContacts', withPageSink({ page: 1, limit: 3 }))
    expect(ids(await list('listExpenses', withPageSink({ page: 2, limit: 3 })))).toEqual(
      seq('exp_', 3, 3),
    )
    expect(onPath(requests, '/v1/expenses/card').map((r) => r.params['cursor'])).toEqual([
      undefined,
      encodeCursor('/v1/expenses/card', 3),
    ])
  })
})

describe('BrexAdapter.listBills asks for bill records only', () => {
  it('sends source_type=BILL on every page', async () => {
    const requests = fakeUpstream({ bills: 5 })
    await drive('listBills', 2, 3)
    const calls = onPath(requests, '/v3/accounting/records')
    expect(calls.length).toBeGreaterThan(0)
    for (const r of calls) expect(r.params['source_type']).toBe('BILL')
  })

  it('sends updatedAfter as updated_at[gte], the documented shape of the filter', async () => {
    const requests = fakeUpstream({ bills: 6 })
    const since = new Date(day(3))
    const params = withPageSink({ page: 1, limit: 10, updatedAfter: since })
    expect(ids(await list('listBills', params))).toEqual(['accr_3', 'accr_4', 'accr_5'])
    expect(onPath(requests, '/v3/accounting/records').map((r) => r.params)).toEqual([
      { limit: 10, source_type: 'BILL', 'updated_at[gte]': since.toISOString() },
    ])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: 3 })
  })

  it('keeps a filtered walk that ended apart from an unfiltered one', async () => {
    const requests = fakeUpstream({ bills: 12 })
    const filtered = withPageSink({ page: 1, limit: 3, updatedAfter: new Date(day(10)) })
    expect(ids(await list('listBills', filtered))).toEqual(['accr_10', 'accr_11'])
    expect(readUpstreamPage(filtered)?.hasMore).toBe(false)
    const unfiltered = withPageSink({ page: 2, limit: 3 })
    expect(ids(await list('listBills', unfiltered))).toEqual(seq('accr_', 3, 3))
    expect(readUpstreamPage(unfiltered)?.hasMore).toBe(true)
    expect(onPath(requests, '/v3/accounting/records')).toHaveLength(3)
  })

  it('ends where has_next_page is false, even when a next_cursor comes with it', async () => {
    const requests = fakeUpstream({ bills: 4, recordsCursorAtEnd: true })
    const { served, hasMore } = await drive('listBills', 2, 3)
    expect(served).toEqual([seq('accr_', 2), seq('accr_', 2, 2), []])
    expect(hasMore).toEqual([true, false, false])
    expect(onPath(requests, '/v3/accounting/records')).toHaveLength(2)
  })

  it('reports total_count as meta.totalCount', async () => {
    fakeUpstream({ bills: 5 })
    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter)
    const env1 = listPage(await list('listBills', p1), p1, 'brex')
    expect(env1.meta.totalCount).toBe(5)
    expect(env1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const env3 = listPage(await list('listBills', p3), p3, 'brex')
    expect(ids(env3.data)).toEqual(['accr_4'])
    expect(env3.meta.totalCount).toBe(5)
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('BrexAdapter.listExpenses filters by updated_at_start', () => {
  it('sends updatedAfter as updated_at_start and pages the filtered list', async () => {
    const requests = fakeUpstream({ expenses: 8 })
    const since = new Date(day(3))
    const served: string[][] = []
    for (let page = 1; page <= 3; page++)
      served.push(
        ids(await list('listExpenses', withPageSink({ page, limit: 2, updatedAfter: since }))),
      )
    expect(served).toEqual([seq('exp_', 2, 3), seq('exp_', 2, 5), ['exp_7']])
    for (const r of onPath(requests, '/v1/expenses/card'))
      expect(r.params['updated_at_start']).toBe(since.toISOString())
  })
})

// ── cash accounts: the whole list, sliced locally ────────────────────────

describe('BrexAdapter.listAccounts pages the whole cash-account list locally', () => {
  it('serves 2L + 1 accounts once each across pages 1..3, and reports the end', async () => {
    const L = 2
    const N = 2 * L + 1
    fakeUpstream({ accounts: N })
    const { served, hasMore } = await drive('listAccounts', L, 3)
    expect(served).toEqual([seq('cash_acc_', 2), seq('cash_acc_', 2, 2), ['cash_acc_4']])
    expect(hasMore).toEqual([true, true, false])
  })

  it('asks for the list with no parameters, since none are documented', async () => {
    const requests = fakeUpstream({ accounts: 5 })
    await adapter.listAccounts(CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(requests).toEqual([{ url: '/v2/accounts/cash', params: {}, auth: MAIN_AUTH }])
  })

  it('reports the total, and ends on page 2 when N = 2L', async () => {
    fakeUpstream({ accounts: 4 })
    const params = withPageSink({ page: 2, limit: 2 })
    const rows = await adapter.listAccounts(CREDS, params)
    expect(ids(rows)).toEqual(['cash_acc_2', 'cash_acc_3'])
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 4, hasMore: false })
    const { served, hasMore } = await drive('listAccounts', 2, 3)
    expect(served[2]).toEqual([])
    expect(hasMore).toEqual([true, false, false])
  })

  it('serves every account on page 1 at a limit above the list', async () => {
    fakeUpstream({ accounts: 7 })
    const { served, hasMore } = await drive('listAccounts', 500, 2)
    expect(served[0]).toEqual(seq('cash_acc_', 7))
    expect(served[1]).toEqual([])
    expect(hasMore).toEqual([false, false])
  })

  it('follows a next_cursor if the list ever returns one, so no account is dropped', async () => {
    const requests = fakeUpstream({ accounts: 5, accountsPages: 3 })
    const { served } = await drive('listAccounts', 10, 1)
    expect(served[0]).toEqual(seq('cash_acc_', 5))
    expect(requests.map((r) => r.params['cursor'])).toEqual([
      undefined,
      encodeCursor('/v2/accounts/cash', 2),
      encodeCursor('/v2/accounts/cash', 4),
    ])
  })

  it('reads an empty-string next_cursor as the end, with one request', async () => {
    const requests = fakeUpstream({ accounts: 3, endCursor: '' })
    const { served } = await drive('listAccounts', 10, 1)
    expect(served[0]).toEqual(seq('cash_acc_', 3))
    expect(requests).toHaveLength(1)
  })

  it('ends when a followed cursor brings no new account, since the list takes no cursor', async () => {
    const requests = fakeUpstream({ accounts: 3, accountsCursorLoops: 'same-page' })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(ids(await adapter.listAccounts(CREDS, params))).toEqual(seq('cash_acc_', 3))
    expect(readUpstreamPage(params)?.totalCount).toBe(3)
    expect(requests).toHaveLength(2)
  })

  it('follows the next_cursor of an empty first page', async () => {
    const requests = fakeUpstream({ accounts: 3, accountsFirstPageEmpty: true })
    expect(ids(await adapter.listAccounts(CREDS, withPageSink({ page: 1, limit: 10 })))).toEqual(
      seq('cash_acc_', 3),
    )
    expect(requests).toHaveLength(2)
  })

  it('throws rather than loop when a repeated cursor keeps bringing new accounts', async () => {
    const requests = fakeUpstream({ accounts: 3, accountsCursorLoops: 'new-accounts' })
    await expect(adapter.listAccounts(CREDS, withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(
      /keeps returning new accounts under a next_cursor it already followed/,
    )
    expect(requests).toHaveLength(2)
  })

  it('pages at the limit parseListQuery delivers, and reports meta.hasMore', async () => {
    fakeUpstream({ accounts: 5 })
    const p2 = parseListQuery({ limit: '2', page: '2' }, adapter)
    const env2 = listPage(await adapter.listAccounts(CREDS, p2), p2, 'brex')
    expect(ids(env2.data)).toEqual(['cash_acc_2', 'cash_acc_3'])
    expect(env2.meta.hasMore).toBe(true)
    expect(env2.meta.totalCount).toBe(5)
    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const env3 = listPage(await adapter.listAccounts(CREDS, p3), p3, 'brex')
    expect(ids(env3.data)).toEqual(['cash_acc_4'])
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('BrexAdapter.getAccount', () => {
  it('reads GET /v2/accounts/cash/{id}, the documented single-account endpoint', async () => {
    const requests = fakeUpstream({ accounts: 3 })
    expect((await adapter.getAccount(CREDS, 'cash_acc_1')).id).toBe('cash_acc_1')
    expect(requests).toEqual([{ url: '/v2/accounts/cash/cash_acc_1', params: {}, auth: MAIN_AUTH }])
  })

  it('encodes the id as one path segment', async () => {
    const requests = fakeUpstream({ accounts: 1 })
    await expect(adapter.getAccount(CREDS, 'odd/id?x')).rejects.toMatchObject({
      response: { status: 404 },
    })
    expect(requests.map((r) => r.url)).toEqual(['/v2/accounts/cash/odd%2Fid%3Fx'])
  })
})

// ── transactions: the card list, then each cash account's list ───────────

describe('BrexAdapter.listTransactions streams card, then each cash account, by cursor', () => {
  /** 3 card rows, then 1 on cash_acc_0 and 1 on cash_acc_1: N = 5 = 2L + 1 at L = 2. */
  const DATA: Dataset = { cardTxns: 3, accounts: 2, cashTxns: { cash_acc_0: 1, cash_acc_1: 1 } }
  const ALL = ['card_0', 'card_1', 'card_2', 'cash_acc_0_txn_0', 'cash_acc_1_txn_0']

  it('serves 2L + 1 rows once each across pages 1..3, and reports the end', async () => {
    fakeUpstream(DATA)
    const { served, hasMore } = await drive('listTransactions', 2, 3)
    expect(served).toEqual([ALL.slice(0, 2), ALL.slice(2, 4), ALL.slice(4)])
    expect(hasMore).toEqual([true, true, false])
  })

  it('reads an empty-string next_cursor as the end of each list, like null', async () => {
    const requests = fakeUpstream({ ...DATA, endCursor: '' })
    const { served, hasMore } = await drive('listTransactions', 2, 4)
    expect(served.flat()).toEqual(ALL)
    expect(hasMore).toEqual([true, true, false, false])
    // The cash-account list ended on '' too, so it was read once.
    expect(onPath(requests, '/v2/accounts/cash')).toHaveLength(1)
  })

  it('sends each list its own next_cursor, never the card cursor to a cash account', async () => {
    const requests = fakeUpstream({
      cardTxns: 3,
      accounts: 2,
      cashTxns: { cash_acc_0: 3, cash_acc_1: 1 },
    })
    const { served } = await drive('listTransactions', 2, 4)
    expect(served.flat()).toEqual([
      ...seq('card_', 3),
      ...seq('cash_acc_0_txn_', 3),
      'cash_acc_1_txn_0',
    ])
    const card = onPath(requests, '/v2/transactions/card/primary')
    expect(card.map((r) => r.params)).toEqual([
      { limit: 2 },
      { limit: 2, cursor: encodeCursor('/v2/transactions/card/primary', 2) },
    ])
    const cash0 = onPath(requests, '/v2/transactions/cash/cash_acc_0')
    expect(cash0.map((r) => r.params)).toEqual([
      { limit: 2 },
      { limit: 2, cursor: encodeCursor('/v2/transactions/cash/cash_acc_0', 2) },
    ])
    expect(onPath(requests, '/v2/transactions/cash/cash_acc_1').map((r) => r.params)).toEqual([
      { limit: 2 },
    ])
    // The cash-account list documents no parameters, and is read once for the walk.
    expect(onPath(requests, '/v2/accounts/cash')).toEqual([
      { url: '/v2/accounts/cash', params: {}, auth: MAIN_AUTH },
    ])
  })

  it('never serves more than the limit on a page, whatever the number of cash accounts', async () => {
    fakeUpstream({
      cardTxns: 2,
      accounts: 3,
      cashTxns: { cash_acc_0: 2, cash_acc_1: 2, cash_acc_2: 2 },
    })
    const { served, hasMore } = await drive('listTransactions', 2, 5)
    expect(served.map((p) => p.length)).toEqual([2, 2, 2, 2, 0])
    expect(new Set(served.flat()).size).toBe(8)
    expect(hasMore).toEqual([true, true, true, false, false])
  })

  it('passes over a cash account with no transactions', async () => {
    fakeUpstream({ cardTxns: 1, accounts: 3, cashTxns: { cash_acc_0: 2, cash_acc_2: 2 } })
    const { served, hasMore } = await drive('listTransactions', 2, 4)
    expect(served.flat()).toEqual([
      'card_0',
      ...seq('cash_acc_0_txn_', 2),
      ...seq('cash_acc_2_txn_', 2),
    ])
    expect(hasMore).toEqual([true, true, false, false])
  })

  it('ends on page 2 when N = 2L', async () => {
    fakeUpstream({ cardTxns: 3, accounts: 1, cashTxns: { cash_acc_0: 1 } })
    const { served, hasMore } = await drive('listTransactions', 2, 3)
    expect(served.flat()).toEqual([...seq('card_', 3), 'cash_acc_0_txn_0'])
    expect(served[2]).toEqual([])
    expect(hasMore).toEqual([true, false, false])
  })

  it('ends after the card list when there are no cash accounts', async () => {
    fakeUpstream({ cardTxns: 5, accounts: 0 })
    const { served, hasMore } = await drive('listTransactions', 2, 3)
    expect(served.flat()).toEqual(seq('card_', 5))
    expect(hasMore).toEqual([true, true, false])
  })

  it('clamps an upstream page above the documented maximum and still serves every row', async () => {
    const L = 1001
    const N = 2 * L + 1
    const requests = fakeUpstream({ cardTxns: N - 3, accounts: 1, cashTxns: { cash_acc_0: 3 } })
    const { served, hasMore } = await drive('listTransactions', L, 3)
    expect(served.map((p) => p.length)).toEqual([L, L, 1])
    expect(served.flat()).toEqual([...seq('card_', N - 3), ...seq('cash_acc_0_txn_', 3)])
    expect(hasMore).toEqual([true, true, false])
    for (const r of requests.filter((x) => x.url !== '/v2/accounts/cash'))
      expect(r.params['limit']).toBe(1000)
  })

  it('forwards updatedAfter as posted_at_start to the card list and to every cash account', async () => {
    const requests = fakeUpstream({ cardTxns: 4, accounts: 1, cashTxns: { cash_acc_0: 4 } })
    const since = new Date(day(2))
    const rows = await adapter.listTransactions(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: since }),
    )
    expect(ids(rows)).toEqual(['card_2', 'card_3', 'cash_acc_0_txn_2', 'cash_acc_0_txn_3'])
    for (const r of requests.filter((x) => x.url !== '/v2/accounts/cash'))
      expect(r.params['posted_at_start']).toBe(since.toISOString())
  })

  it('pages at the limit parseListQuery delivers, and reports meta.hasMore', async () => {
    fakeUpstream(DATA)
    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter)
    const env1 = listPage(await adapter.listTransactions(CREDS, p1), p1, 'brex')
    expect(ids(env1.data)).toEqual(ALL.slice(0, 2))
    expect(env1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const env3 = listPage(await adapter.listTransactions(CREDS, p3), p3, 'brex')
    expect(ids(env3.data)).toEqual(ALL.slice(4))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('never serves one connection’s rows to another', async () => {
    const requests = fakeUpstream({ cardTxns: 6 })
    expect(ids(await list('listTransactions', withPageSink({ page: 1, limit: 2 })))).toEqual(
      seq('card_', 2),
    )
    const theirs = await list('listTransactions', withPageSink({ page: 2, limit: 2 }), OTHER)
    expect(ids(theirs)).toEqual(seq('other-access:card_', 2, 2))
    expect(
      onPath(requests, '/v2/transactions/card/primary').some((r) => r.auth === OTHER_AUTH),
    ).toBe(true)
  })

  it('keeps a filtered walk apart from an unfiltered one', async () => {
    fakeUpstream({ cardTxns: 6 })
    await list('listTransactions', withPageSink({ page: 1, limit: 2 }))
    const since = new Date(day(2))
    const rows = await list(
      'listTransactions',
      withPageSink({ page: 2, limit: 2, updatedAfter: since }),
    )
    expect(ids(rows)).toEqual(['card_4', 'card_5'])
  })

  it('keeps a walk at one limit apart from a walk at another, where a cursor is a page index', async () => {
    fakeUpstream({ cardTxns: 12, cursorModel: 'page' })
    expect(ids(await list('listTransactions', withPageSink({ page: 1, limit: 2 })))).toEqual(
      seq('card_', 2),
    )
    expect(ids(await list('listTransactions', withPageSink({ page: 2, limit: 3 })))).toEqual(
      seq('card_', 3, 3),
    )
  })

  it('throws rather than loop when the card list names the cursor it was sent as next', async () => {
    fakeUpstream({ cardTxns: 6, cursorLoopsOn: '/v2/transactions/card/primary' })
    await expect(list('listTransactions', withPageSink({ page: 1, limit: 2 }))).rejects.toThrow(
      /card\/primary returned the cursor it was sent as its next_cursor/,
    )
  })

  it('throws rather than loop when a cash list names the cursor it was sent as next', async () => {
    fakeUpstream({
      cardTxns: 1,
      accounts: 1,
      cashTxns: { cash_acc_0: 6 },
      cursorLoopsOn: '/v2/transactions/cash/cash_acc_0',
    })
    await expect(list('listTransactions', withPageSink({ page: 2, limit: 2 }))).rejects.toThrow(
      /cash\/cash_acc_0 returned the cursor it was sent as its next_cursor/,
    )
  })
})

describe('BrexAdapter.getTransaction', () => {
  it('searches every cash account, read from the list with no parameters', async () => {
    const requests = fakeUpstream({ cardTxns: 2, accounts: 2, cashTxns: { cash_acc_1: 2 } })
    expect((await adapter.getTransaction(CREDS, 'cash_acc_1_txn_1')).id).toBe('cash_acc_1_txn_1')
    expect(onPath(requests, '/v2/accounts/cash')).toEqual([
      { url: '/v2/accounts/cash', params: {}, auth: MAIN_AUTH },
    ])
  })
})

describe('BrexAdapter declares the lowest documented page maximum', () => {
  it('is 100, the ceiling of GET /v1/expenses/card', () => {
    expect(adapter.capabilities?.maxPageSize).toBe(100)
  })
})
