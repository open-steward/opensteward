/**
 * Payhawk paging: listAccounts slices the whole fund-account list locally, and
 * listTransactions walks fund accounts × bank-statement pages with pageByRows.
 *
 * First-party OpenAPI 3.1 spec, the one developers.payhawk.com's Swagger UI
 * loads (https://developers.payhawk.com/config/config.yml):
 *   https://api.payhawk.com/api/v3/docs.json
 *
 * GET /accounts/{accountId}/fund-accounts
 *   "Returns all fund accounts for an account". Its only parameter is the
 *   accountId path parameter: no paging of any kind. The 200 body is
 *   IFundAccountsResponse, `{ items: IFundAccount[], total }`.
 *
 * GET /accounts/{accountId}/fund-accounts/{fundAccountId}/bank-statement
 *   $filter  "JSON-stringified and URL-encoded filter expression object that
 *            conforms to `IBankStatementFilter` schema"
 *   $skip    "Number of objects to skip from the beginning of the result set"
 *   $take    "Max number of objects to return"; IBankStatementQueryParams:
 *            "Used for pagination. Number of objects to include in the
 *            current page", maximum 10000
 *   $orderBy "JSON-stringified and URL-encoded sort expression object that
 *            conforms to `IBankStatementOrderBy` schema"
 *   The 200 body is IBankStatementResponse, `{ lines, total }`, and total is
 *   "Total count of objects. If using pagination, this is the sum of all
 *   pages". The default order is not specified.
 *
 * Neither endpoint documents the order of the fund-account list, so the
 * adapter sorts it by id. Each statement request asks for at least 500 lines
 * (the router's largest page and the sync worker's page), so a cold page N
 * costs N×limit/500 requests rather than N.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { PayhawkAdapter } from '../../../../../../src/verticals/accounting/adapters/payhawk/index'
import { AccountSchema } from '../../../../../../src/verticals/accounting/schema/account'
import { TransactionSchema } from '../../../../../../src/verticals/accounting/schema/transaction'

const CREDS = { accessToken: 'phk-api-key', tenantId: 'acct-1' }
const DOCUMENTED_MAX_TAKE = 10_000
/** The fewest lines one statement request asks for: the router's largest page. */
const MIN_TAKE = 500
const DATE_ASC = JSON.stringify([{ date: 'asc' }])

interface StatementLine {
  id: string
  type: 'debit' | 'credit'
  paymentId: string
  fundAccountId: string
  date: string
  currency: string
  amount: number
  paidCurrency: string
  paidAmount: number
  fxRate: number
  fees: { fx: number; pos: number; bank: number }
  description: string
}

interface StatementFilter {
  date?: { $greaterThanEqual?: string; $lessThanEqual?: string }
  $and?: StatementFilter[]
}

interface Request {
  path: string
  params?: Record<string, unknown>
}

function lineId(account: string, n: number): string {
  return `${account}-${String(n).padStart(5, '0')}`
}

function lineIds(account: string, from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => lineId(account, from + i))
}

function fundAccountId(i: number): string {
  return `fa-${String(i).padStart(5, '0')}`
}

function httpError(status: number): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  })
}

function matches(filter: StatementFilter, line: StatementLine): boolean {
  const at = Date.parse(line.date)
  const gte = filter.date?.$greaterThanEqual
  const lte = filter.date?.$lessThanEqual
  if (gte !== undefined && at < Date.parse(gte)) return false
  if (lte !== undefined && at > Date.parse(lte)) return false
  return (filter.$and ?? []).every((f) => matches(f, line))
}

/**
 * What the spec leaves open, or a server could still do: the fund-account
 * list in another order on every call, a response shorter than `$take`
 * asked, a statement response without `total`, and responses that contradict
 * their own `total`.
 */
interface FakeOptions {
  failStatementOf?: string
  install?: boolean
  /** Answer fund-accounts in a different order on every call. */
  rotateFundAccounts?: boolean
  /** The `total` fund-accounts reports, when it is not the number of items it carries. */
  fundAccountsTotal?: number
  /** Answer at most this many lines per statement request, whatever `$take` asked. */
  maxLinesPerResponse?: number
  /** Leave `total` out of statement responses. */
  omitTotal?: boolean
  /** From this `$skip` on, the account answers no lines while its `total` still counts them. */
  noLinesFrom?: { account: string; skip: number }
}

/**
 * A fake Payhawk that reads ONLY the documented parameters: none on
 * fund-accounts, and $filter, $skip, $take and $orderBy on bank-statement.
 * Anything else (the `startDate` the adapter used to send) is ignored.
 *
 * Every statement line is dated one minute after the one before, across all
 * fund accounts, so `$orderBy` date ascending is the order the lines were
 * built in. With no `$orderBy` the order is "unspecified": the fake rotates
 * it on every request, so offsets over an unordered set move between calls.
 * `$take` above the documented maximum is refused, as the schema refuses it.
 */
function fakePayhawk(accounts: Array<[string, number]>, opts: FakeOptions = {}) {
  const statements = new Map<string, StatementLine[]>()
  let clock = Date.UTC(2026, 0, 1)
  for (const [account, count] of accounts) {
    const lines: StatementLine[] = []
    for (let n = 1; n <= count; n++) {
      clock += 60_000
      lines.push({
        id: lineId(account, n),
        type: n % 2 === 0 ? 'credit' : 'debit',
        paymentId: `pay-${account}-${n}`,
        fundAccountId: account,
        date: new Date(clock).toISOString(),
        currency: 'EUR',
        amount: n + 0.5,
        paidCurrency: 'EUR',
        paidAmount: n + 0.5,
        fxRate: 1,
        fees: { fx: 0, pos: 0, bank: 0.25 },
        description: `Line ${n}`,
      })
    }
    statements.set(account, lines)
  }

  let statementCalls = 0
  let fundAccountCalls = 0
  const requests: Request[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    requests.push({ path, ...(cfg?.params !== undefined ? { params: cfg.params } : {}) })
    if (path === 'fund-accounts') {
      fundAccountCalls++
      let items = accounts.map(([id], i) => ({
        id,
        currency: 'EUR',
        type: 'debit',
        status: 'active',
        balance: { availableAmount: 1000 + i + 0.25, reservedAmount: 10 },
      }))
      if (opts.rotateFundAccounts && items.length > 0) {
        const r = fundAccountCalls % items.length
        items = [...items.slice(r), ...items.slice(0, r)]
      }
      return { data: { items, total: opts.fundAccountsTotal ?? items.length } }
    }
    const m = /^fund-accounts\/([^/]+)\/bank-statement$/.exec(path)
    const all = m ? statements.get(m[1]!) : undefined
    if (!m || !all) throw httpError(404)
    if (m[1] === opts.failStatementOf) throw httpError(500)
    const p = cfg?.params ?? {}

    let rows = all
    const filter = p['$filter']
    if (filter !== undefined && filter !== '') {
      if (typeof filter !== 'string') throw httpError(400)
      const parsed = JSON.parse(filter) as StatementFilter
      rows = rows.filter((line) => matches(parsed, line))
    }

    statementCalls++
    const orderBy = p['$orderBy']
    if (orderBy !== undefined && orderBy !== '') {
      if (typeof orderBy !== 'string') throw httpError(400)
      const [order] = JSON.parse(orderBy) as Array<{ date?: 'asc' | 'desc' }>
      const sign = order?.date === 'desc' ? -1 : 1
      rows = [...rows].sort((a, b) => sign * (Date.parse(a.date) - Date.parse(b.date)))
    } else if (rows.length > 0) {
      const r = statementCalls % rows.length
      rows = [...rows.slice(r), ...rows.slice(0, r)]
    }

    const skip = p['$skip'] === undefined ? 0 : Number(p['$skip'])
    const take = p['$take'] === undefined ? 50 : Number(p['$take'])
    if (!Number.isInteger(skip) || skip < 0) throw httpError(400)
    if (!Number.isInteger(take) || take < 1 || take > DOCUMENTED_MAX_TAKE) throw httpError(400)
    const answered = Math.min(take, opts.maxLinesPerResponse ?? take)
    const gap = opts.noLinesFrom
    const lines =
      gap && gap.account === m[1] && skip >= gap.skip ? [] : rows.slice(skip, skip + answered)
    return { data: opts.omitTotal ? { lines } : { lines, total: rows.length } }
  })
  const client = { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() }
  if (opts.install !== false) vi.spyOn(axios, 'create').mockReturnValue(client as never)
  return { get, requests, statements, client }
}

/** Serve each API key its own fake Payhawk, as two connections would see. */
function installByApiKey(fakes: Record<string, Fake>): void {
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: { headers?: Record<string, unknown> }) => {
    const fake = fakes[String(cfg?.headers?.['X-Payhawk-ApiKey'])]
    if (!fake) throw new Error('no fake for this API key')
    return fake.client
  }) as never)
}

type Fake = ReturnType<typeof fakePayhawk>

function statementRequests(requests: readonly Request[]): Request[] {
  return requests.filter((r) => r.path.endsWith('/bank-statement'))
}

/**
 * Drive listTransactions as the sync worker does: one sink per page. `cold`
 * forgets the walk before every page, as a new process or a minute's pause
 * would.
 */
async function driveTransactions(
  fake: Fake,
  pages: number,
  limit: number,
  extra: QueryParams = {},
  { cold = false }: { cold?: boolean } = {},
) {
  const adapter = new PayhawkAdapter()
  const rows: Array<string | undefined> = []
  const hasMore: Array<boolean | undefined> = []
  const perPage: Request[][] = []
  for (let page = 1; page <= pages; page++) {
    if (cold) _resetRowPager()
    const before = fake.requests.length
    const params = withPageSink({ ...extra, page, limit })
    const got = await adapter.listTransactions(CREDS, params)
    for (const t of got) TransactionSchema.parse(t)
    rows.push(...got.map((t) => t.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    perPage.push(fake.requests.slice(before))
  }
  return { rows, hasMore, perPage }
}

/** Drive listAccounts as the sync worker does: one sink per page. */
async function driveAccounts(pages: number, limit: number) {
  const adapter = new PayhawkAdapter()
  const rows: Array<string | undefined> = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const got = await adapter.listAccounts(CREDS, params)
    for (const a of got) AccountSchema.parse(a)
    rows.push(...got.map((a) => a.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    totals.push(readUpstreamPage(params)?.totalCount)
  }
  return { rows, hasMore, totals }
}

function accountsOf(n: number): Array<[string, number]> {
  return Array.from({ length: n }, (_, i): [string, number] => [fundAccountId(i + 1), 0])
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('payhawk capabilities', () => {
  it('declares the documented $take maximum, 10000, as maxPageSize', () => {
    expect(new PayhawkAdapter().capabilities.maxPageSize).toBe(DOCUMENTED_MAX_TAKE)
  })
})

describe('payhawk listTransactions walks fund accounts × bank-statement $skip/$take', () => {
  it('N = 2L + 1 in one fund account: three worker pages serve every line once, in date order', async () => {
    const L = MIN_TAKE
    const fake = fakePayhawk([['fa-a', 2 * L + 1]])
    const { rows, hasMore, perPage } = await driveTransactions(fake, 3, L)
    expect(rows).toEqual(lineIds('fa-a', 1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    // Each upstream page is fetched once, at $take = the sync worker's limit,
    // with $skip moving by the lines already served.
    expect(statementRequests(fake.requests).map((r) => r.params)).toEqual([
      { $orderBy: DATE_ASC, $skip: 0, $take: L },
      { $orderBy: DATE_ASC, $skip: L, $take: L },
      { $orderBy: DATE_ASC, $skip: 2 * L, $take: L },
    ])
    // Page 2 asks for the lines past the ones page 1 already holds.
    expect(statementRequests(perPage[1]!).map((r) => r.params?.['$skip'])).toEqual([2 * L])
    // The fund-account list is read once per walk, not once per page.
    expect(fake.requests.filter((r) => r.path === 'fund-accounts')).toHaveLength(1)
  })

  it('N = 2L + 1 at a small limit: every page is cut from one request of 500 lines', async () => {
    const L = 5
    const fake = fakePayhawk([['fa-a', 2 * L + 1]])
    const { rows, hasMore, perPage } = await driveTransactions(fake, 3, L)
    expect(rows).toEqual(lineIds('fa-a', 1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(statementRequests(fake.requests).map((r) => r.params)).toEqual([
      { $orderBy: DATE_ASC, $skip: 0, $take: MIN_TAKE },
    ])
    expect(perPage[1]).toEqual([])
    expect(perPage[2]).toEqual([])
  })

  it('flattens lines across fund accounts, walking past an empty one', async () => {
    const L = 5
    const fake = fakePayhawk([
      ['fa-a', 7],
      ['fa-b', 0],
      ['fa-c', 4],
    ])
    const { rows, hasMore } = await driveTransactions(fake, 3, L)
    expect(rows).toEqual([...lineIds('fa-a', 1, 7), ...lineIds('fa-c', 1, 4)])
    expect(hasMore).toEqual([true, true, false])
    expect(statementRequests(fake.requests).map((r) => r.path)).toEqual([
      'fund-accounts/fa-a/bank-statement',
      'fund-accounts/fa-b/bank-statement',
      'fund-accounts/fa-c/bank-statement',
    ])
  })

  it('N = 2L: page 2 is the last page and page 3 is empty', async () => {
    const L = MIN_TAKE
    const fake = fakePayhawk([['fa-a', 2 * L]])
    const { rows, hasMore, perPage } = await driveTransactions(fake, 3, L)
    expect(rows).toEqual(lineIds('fa-a', 1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
    // The response's `total` ends the statement on a full page: no request for
    // an empty third page, and page 3 is answered without asking upstream.
    expect(statementRequests(fake.requests).map((r) => r.params?.['$skip'])).toEqual([0, L])
    expect(perPage[2]).toEqual([])
  })

  it('N = 2L across accounts, with an empty account last: page 2 still ends the walk', async () => {
    const L = 5
    const fake = fakePayhawk([
      ['fa-a', 3],
      ['fa-b', 7],
      ['fa-c', 0],
    ])
    const { rows, hasMore } = await driveTransactions(fake, 3, L)
    expect(rows).toEqual([...lineIds('fa-a', 1, 3), ...lineIds('fa-b', 1, 7)])
    expect(hasMore).toEqual([true, false, false])
  })

  it('reads the documented { lines, total } and { items, total } envelopes, fees object and all', async () => {
    const fake = fakePayhawk([['fa-a', 3]])
    const params = withPageSink({ page: 1, limit: 10 })
    const got = await new PayhawkAdapter().listTransactions(CREDS, params)
    expect(got.map((t) => t.id)).toEqual(lineIds('fa-a', 1, 3))
    expect(got[0]).toMatchObject({ totalAmount: 150, currency: 'EUR' })
    expect(got[0]!.lineItems).toEqual([
      { name: 'debit', description: 'Line 1', totalAmount: 150 },
      { name: 'fee', description: 'Bank fee', totalAmount: 25 },
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    // `total` ends the statement: a short last page needs no further request.
    expect(statementRequests(fake.requests).map((r) => r.params)).toEqual([
      { $orderBy: DATE_ASC, $skip: 0, $take: MIN_TAKE },
    ])
  })

  it('with no limit, serves the default page of 100 lines', async () => {
    const fake = fakePayhawk([['fa-a', 150]])
    const adapter = new PayhawkAdapter()
    const p1 = withPageSink({ page: 1 })
    const p2 = withPageSink({ page: 2 })
    expect((await adapter.listTransactions(CREDS, p1)).map((t) => t.id)).toEqual(
      lineIds('fa-a', 1, 100),
    )
    expect((await adapter.listTransactions(CREDS, p2)).map((t) => t.id)).toEqual(
      lineIds('fa-a', 101, 50),
    )
    expect([readUpstreamPage(p1)?.hasMore, readUpstreamPage(p2)?.hasMore]).toEqual([true, false])
    for (const r of statementRequests(fake.requests)) expect(r.params?.['$take']).toBe(MIN_TAKE)
  })

  it('asks for date order on every statement request, since the default order is unspecified', async () => {
    const fake = fakePayhawk([
      ['fa-a', 6],
      ['fa-b', 6],
    ])
    await driveTransactions(fake, 3, 4)
    const sent = statementRequests(fake.requests)
    expect(sent.length).toBeGreaterThan(0)
    for (const r of sent) expect(r.params?.['$orderBy']).toBe(DATE_ASC)
  })

  it('a limit above the documented maximum sends $take 10000 and still serves every line', async () => {
    const L = DOCUMENTED_MAX_TAKE + 1
    const fake = fakePayhawk([['fa-a', 2 * L + 1]])
    const { rows, hasMore } = await driveTransactions(fake, 3, L)
    expect(rows).toEqual(lineIds('fa-a', 1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    const takes = statementRequests(fake.requests).map((r) => r.params?.['$take'])
    expect(new Set(takes)).toEqual(new Set([DOCUMENTED_MAX_TAKE]))
  })

  it('a hand-built fractional limit above 500 asks for a whole number of lines', async () => {
    const fake = fakePayhawk([['fa-a', 700]])
    const params = withPageSink({ page: 1, limit: 600.5 })
    const got = await new PayhawkAdapter().listTransactions(CREDS, params)
    expect(got.map((t) => t.id)).toEqual(lineIds('fa-a', 1, 600))
    expect(statementRequests(fake.requests)[0]?.params?.['$take']).toBe(600)
  })

  it('the limit as parseListQuery delivers it: a cold page 2 of limit 10 is lines 11-20', async () => {
    fakePayhawk([
      ['fa-a', 12],
      ['fa-b', 23],
    ])
    const params = parseListQuery({ page: '2', limit: '10' }, new PayhawkAdapter())
    const got = await new PayhawkAdapter().listTransactions(CREDS, params)
    expect(got.map((t) => t.id)).toEqual([...lineIds('fa-a', 11, 2), ...lineIds('fa-b', 1, 8)])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('parseListQuery caps limit=99999 at 500, and three pages serve every line', async () => {
    const N = 2 * 500 + 1
    const fake = fakePayhawk([
      ['fa-a', 600],
      ['fa-b', N - 600],
    ])
    const adapter = new PayhawkAdapter()
    const rows: Array<string | undefined> = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '99999' }, adapter)
      expect(params.limit).toBe(500)
      rows.push(...(await adapter.listTransactions(CREDS, params)).map((t) => t.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(rows).toEqual([...lineIds('fa-a', 1, 600), ...lineIds('fa-b', 1, N - 600)])
    expect(hasMore).toEqual([true, true, false])
    for (const r of statementRequests(fake.requests)) expect(r.params?.['$take']).toBe(500)
  })

  it('updatedAfter is the documented JSON $filter on the line date, on every page', async () => {
    const fake = fakePayhawk([
      ['fa-a', 8],
      ['fa-b', 8],
    ])
    // fa-a line 6 is the sixth line built, one minute apart from 2026-01-01.
    const since = fake.statements.get('fa-a')![5]!.date
    const { rows, hasMore } = await driveTransactions(fake, 3, 4, {
      updatedAfter: new Date(since),
    })
    expect(rows).toEqual([...lineIds('fa-a', 6, 3), ...lineIds('fa-b', 1, 8)])
    expect(hasMore).toEqual([true, true, false])
    const filter = JSON.stringify({ date: { $greaterThanEqual: since } })
    for (const r of statementRequests(fake.requests)) {
      expect(r.params?.['$filter']).toBe(filter)
      expect(r.params).not.toHaveProperty('startDate')
    }
  })

  it('a page with no filter never serves lines walked under a filter', async () => {
    const fake = fakePayhawk([['fa-a', 20]])
    const adapter = new PayhawkAdapter()
    const since = new Date(fake.statements.get('fa-a')![10]!.date)
    const filtered = await adapter.listTransactions(
      CREDS,
      withPageSink({ page: 1, limit: 5, updatedAfter: since }),
    )
    expect(filtered.map((t) => t.id)).toEqual(lineIds('fa-a', 11, 5))
    const unfiltered = await adapter.listTransactions(CREDS, withPageSink({ page: 2, limit: 5 }))
    expect(unfiltered.map((t) => t.id)).toEqual(lineIds('fa-a', 6, 5))
  })

  it('a page under one watermark never serves lines walked under another', async () => {
    const fake = fakePayhawk([['fa-a', 20]])
    const adapter = new PayhawkAdapter()
    const at = (n: number) => new Date(fake.statements.get('fa-a')![n - 1]!.date)
    await adapter.listTransactions(CREDS, withPageSink({ page: 1, limit: 5, updatedAfter: at(1) }))
    const got = await adapter.listTransactions(
      CREDS,
      withPageSink({ page: 2, limit: 5, updatedAfter: at(10) }),
    )
    expect(got.map((t) => t.id)).toEqual(lineIds('fa-a', 15, 5))
  })

  it('a response shorter than $take asked moves $skip by the lines it held', async () => {
    const fake = fakePayhawk(
      [
        ['fa-a', 23],
        ['fa-b', 3],
      ],
      { maxLinesPerResponse: 4 },
    )
    const { rows, hasMore } = await driveTransactions(fake, 3, 10)
    expect(rows).toEqual([...lineIds('fa-a', 1, 23), ...lineIds('fa-b', 1, 3)])
    expect(hasMore).toEqual([true, true, false])
    expect(
      statementRequests(fake.requests)
        .filter((r) => r.path.includes('/fa-a/'))
        .map((r) => r.params?.['$skip']),
    ).toEqual([0, 4, 8, 12, 16, 20])
  })

  it('a statement with no lines at a $skip its own total counts fails the page, and stops asking', async () => {
    const fake = fakePayhawk(
      [
        ['fa-a', 12],
        ['fa-b', 3],
      ],
      { maxLinesPerResponse: 10, noLinesFrom: { account: 'fa-a', skip: 10 } },
    )
    await expect(
      new PayhawkAdapter().listTransactions(CREDS, withPageSink({ page: 1, limit: 20 })),
    ).rejects.toThrow("fund account fa-a's bank statement returned no lines at $skip 10 of 12")
    // Neither moved on to fa-b, dropping fa-a's last two lines, nor asked again.
    expect(statementRequests(fake.requests).map((r) => [r.path, r.params?.['$skip']])).toEqual([
      ['fund-accounts/fa-a/bank-statement', 0],
      ['fund-accounts/fa-a/bank-statement', 10],
    ])
  })

  it('a statement response without total ends an account on its short page, or on no lines', async () => {
    const fake = fakePayhawk(
      [
        ['fa-a', 11],
        ['fa-b', 0],
        ['fa-c', 2],
      ],
      { omitTotal: true },
    )
    const { rows, hasMore } = await driveTransactions(fake, 3, 5)
    expect(rows).toEqual([...lineIds('fa-a', 1, 11), ...lineIds('fa-c', 1, 2)])
    expect(hasMore).toEqual([true, true, false])
    expect(statementRequests(fake.requests).map((r) => [r.path, r.params?.['$skip']])).toEqual([
      ['fund-accounts/fa-a/bank-statement', 0],
      ['fund-accounts/fa-b/bank-statement', 0],
      ['fund-accounts/fa-c/bank-statement', 0],
    ])
  })

  it('a statement response without total continues past a full page', async () => {
    const L = MIN_TAKE
    const fake = fakePayhawk([['fa-a', 2 * L + 1]], { omitTotal: true })
    const { rows, hasMore } = await driveTransactions(fake, 3, L)
    expect(rows).toEqual(lineIds('fa-a', 1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(statementRequests(fake.requests).map((r) => r.params?.['$skip'])).toEqual([0, L, 2 * L])
  })

  it('a cold page 50 of limit 100 costs 11 statement requests, not 51', async () => {
    const fake = fakePayhawk([['fa-a', 6000]])
    const params = parseListQuery({ page: '50', limit: '100' }, new PayhawkAdapter())
    const got = await new PayhawkAdapter().listTransactions(CREDS, params)
    expect(got.map((t) => t.id)).toEqual(lineIds('fa-a', 4901, 100))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(statementRequests(fake.requests).map((r) => r.params?.['$skip'])).toEqual(
      Array.from({ length: 11 }, (_, i) => i * MIN_TAKE),
    )
  })

  it('a cold page 1002 of limit 1 is served, not refused for walking too far', async () => {
    const fake = fakePayhawk([['fa-a', 1500]])
    const params = parseListQuery({ page: '1002', limit: '1' }, new PayhawkAdapter())
    const got = await new PayhawkAdapter().listTransactions(CREDS, params)
    expect(got.map((t) => t.id)).toEqual([lineId('fa-a', 1002)])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(statementRequests(fake.requests)).toHaveLength(3)
  })

  it('fund accounts listed in another order on every call: cold pages still serve every line once', async () => {
    const fake = fakePayhawk(
      [
        ['fa-c', 5],
        ['fa-a', 4],
        ['fa-b', 6],
      ],
      { rotateFundAccounts: true },
    )
    const { rows, hasMore } = await driveTransactions(fake, 3, 5, {}, { cold: true })
    expect(rows).toEqual([
      ...lineIds('fa-a', 1, 4),
      ...lineIds('fa-b', 1, 6),
      ...lineIds('fa-c', 1, 5),
    ])
    expect(hasMore).toEqual([true, true, false])
  })

  it('a fund-account list that says it holds more than it returned fails the page', async () => {
    fakePayhawk(
      [
        ['fa-a', 2],
        ['fa-b', 2],
      ],
      { fundAccountsTotal: 3 },
    )
    await expect(
      new PayhawkAdapter().listTransactions(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow('fund-accounts returned 2 of 3 fund accounts')
  })

  it('a fund account whose statement fails fails the page instead of being dropped', async () => {
    fakePayhawk(
      [
        ['fa-a', 2],
        ['fa-b', 2],
      ],
      { failStatementOf: 'fa-b' },
    )
    await expect(
      new PayhawkAdapter().listTransactions(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/500/)
  })

  it('no fund accounts: an empty page that says it is the last', async () => {
    fakePayhawk([])
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await new PayhawkAdapter().listTransactions(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('two connections to one Payhawk account never share a walk or its rows', async () => {
    const L = 5
    const a = fakePayhawk([['fa-a', 2 * L + 1]], { install: false })
    const b = fakePayhawk([['fa-z', 2 * L + 1]], { install: false })
    installByApiKey({ 'key-a': a, 'key-b': b })
    const credsA = { accessToken: 'key-a', tenantId: 'acct-1' }
    const credsB = { accessToken: 'key-b', tenantId: 'acct-1' }
    const adapter = new PayhawkAdapter()
    // Connection A's page 1 leaves A's next upstream page in the pager's slot.
    await adapter.listTransactions(credsA, withPageSink({ page: 1, limit: L }))
    const pageB = await adapter.listTransactions(credsB, withPageSink({ page: 2, limit: L }))
    expect(pageB.map((t) => t.id)).toEqual(lineIds('fa-z', L + 1, L))
    expect(statementRequests(b.requests).length).toBeGreaterThan(0)
  })
})

describe('payhawk listAccounts pages locally over the whole fund-account list', () => {
  it('N = 2L + 1: three worker pages serve every fund account once, in order', async () => {
    const L = 10
    const fake = fakePayhawk(accountsOf(2 * L + 1))
    const { rows, hasMore, totals } = await driveAccounts(3, L)
    expect(rows).toEqual(accountsOf(2 * L + 1).map(([id]) => id))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([21, 21, 21])
    // The endpoint takes no paging parameter, so every page is the same GET.
    expect(fake.requests).toEqual([
      { path: 'fund-accounts' },
      { path: 'fund-accounts' },
      { path: 'fund-accounts' },
    ])
  })

  it('N = 2L: page 2 is the last page and page 3 is empty', async () => {
    const L = 10
    fakePayhawk(accountsOf(2 * L))
    const { rows, hasMore } = await driveAccounts(3, L)
    expect(rows).toEqual(accountsOf(2 * L).map(([id]) => id))
    expect(hasMore).toEqual([true, false, false])
  })

  it('fund accounts listed in another order on every call: the pages still serve each one once, by id', async () => {
    fakePayhawk(
      [
        ['fa-00004', 0],
        ['fa-00001', 0],
        ['fa-00006', 0],
        ['fa-00003', 0],
        ['fa-00005', 0],
        ['fa-00002', 0],
      ],
      { rotateFundAccounts: true },
    )
    const { rows, hasMore } = await driveAccounts(3, 2)
    expect(rows).toEqual(accountsOf(6).map(([id]) => id))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a list that says it holds more than it returned fails instead of passing as the whole list', async () => {
    fakePayhawk(accountsOf(3), { fundAccountsTotal: 5 })
    await expect(
      new PayhawkAdapter().listAccounts(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow('fund-accounts returned 3 of 5 fund accounts')
  })

  it('maps the documented balance object to minor units', async () => {
    fakePayhawk(accountsOf(1))
    const [account] = await new PayhawkAdapter().listAccounts(CREDS, withPageSink({ limit: 10 }))
    expect(account).toMatchObject({ id: fundAccountId(1), status: 'ACTIVE', balance: 100025 })
  })

  it('the limit as parseListQuery delivers it: page 2 of limit 10 is fund accounts 11-20', async () => {
    fakePayhawk(accountsOf(35))
    const params = parseListQuery({ page: '2', limit: '10' }, new PayhawkAdapter())
    const got = await new PayhawkAdapter().listAccounts(CREDS, params)
    expect(got.map((a) => a.id)).toEqual(
      accountsOf(20)
        .slice(10)
        .map(([id]) => id),
    )
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, totalCount: 35 })
  })

  it('parseListQuery caps limit=99999 at 500, and three pages serve every fund account', async () => {
    const N = 2 * 500 + 1
    fakePayhawk(accountsOf(N))
    const adapter = new PayhawkAdapter()
    const rows: Array<string | undefined> = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '99999' }, adapter)
      expect(params.limit).toBe(500)
      rows.push(...(await adapter.listAccounts(CREDS, params)).map((a) => a.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(rows).toEqual(accountsOf(N).map(([id]) => id))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a direct limit above the documented maximum is served whole from the rows in hand', async () => {
    const N = 2 * (DOCUMENTED_MAX_TAKE + 1) + 1
    fakePayhawk(accountsOf(N))
    const { rows, hasMore } = await driveAccounts(3, DOCUMENTED_MAX_TAKE + 1)
    expect(rows).toEqual(accountsOf(N).map(([id]) => id))
    expect(hasMore).toEqual([true, true, false])
  })
})

describe('payhawk through the API path', () => {
  const adapter = new PayhawkAdapter()

  async function transactionsPage(query: Record<string, string>) {
    const params = parseListQuery(query, adapter)
    return listPage(await adapter.listTransactions(CREDS, params), params, 'payhawk')
  }

  async function accountsPage(query: Record<string, string>) {
    const params = parseListQuery(query, adapter)
    return listPage(await adapter.listAccounts(CREDS, params), params, 'payhawk')
  }

  it('transactions: meta.hasMore is true on each full page with more behind it and false on the last', async () => {
    fakePayhawk([
      ['fa-a', 13],
      ['fa-b', 8],
    ])
    const p1 = await transactionsPage({ page: '1', limit: '10' })
    const p2 = await transactionsPage({ page: '2', limit: '10' })
    const p3 = await transactionsPage({ page: '3', limit: '10' })
    expect([...p1.data, ...p2.data, ...p3.data].map((t) => t.id)).toEqual([
      ...lineIds('fa-a', 1, 13),
      ...lineIds('fa-b', 1, 8),
    ])
    expect([p1.meta.hasMore, p2.meta.hasMore, p3.meta.hasMore]).toEqual([true, true, false])
  })

  it('transactions: meta.hasMore is false on a full last page (N = 2L), not null', async () => {
    fakePayhawk([
      ['fa-a', 12],
      ['fa-b', 8],
    ])
    const p2 = await transactionsPage({ page: '2', limit: '10' })
    expect(p2.data.map((t) => t.id)).toEqual([...lineIds('fa-a', 11, 2), ...lineIds('fa-b', 1, 8)])
    expect(p2.meta.hasMore).toBe(false)
  })

  it('accounts: meta.hasMore and totalCount come from the whole list', async () => {
    fakePayhawk(accountsOf(21))
    const p1 = await accountsPage({ page: '1', limit: '10' })
    const p2 = await accountsPage({ page: '2', limit: '10' })
    const p3 = await accountsPage({ page: '3', limit: '10' })
    expect([...p1.data, ...p2.data, ...p3.data].map((a) => a.id)).toEqual(
      accountsOf(21).map(([id]) => id),
    )
    expect([p1.meta.hasMore, p2.meta.hasMore, p3.meta.hasMore]).toEqual([true, true, false])
    expect(p1.meta.totalCount).toBe(21)
  })
})
