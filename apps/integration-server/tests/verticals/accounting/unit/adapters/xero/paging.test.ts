/**
 * Paging contract for Xero's two whole-collection reads, listAccounts and
 * listTaxRates, driven through the real adapter.
 *
 * Neither endpoint pages. Xero's own OpenAPI document
 * (https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/master/xero_accounting.yaml)
 * declares getAccounts as "Retrieves the full chart of accounts" with exactly
 * three parameters, the `If-Modified-Since` header and the `where` and `order`
 * query filters, and getTaxRates with only `where` and `order`. The
 * requests-and-responses guide says the same in prose: "With some endpoints
 * you may need to retrieve a full list of resources e.g. TaxRates or
 * BrandingThemes. You can do this by simply using a HTTP GET with the resource
 * name." Its list of paged endpoints (Invoices, Contacts, CreditNotes,
 * BankTransactions, ManualJournals, Payments, PurchaseOrders, Prepayments,
 * Overpayments) names neither.
 *
 * Before the fix listTaxRates returned the whole table for every page, so the
 * router truncated page 2 back to page 1's rows and every rate past the first
 * page was unreachable. listAccounts sliced by hand and reported a total, but
 * never reported `pagedLocally` or `hasMore`. Both now slice the one response
 * with the shared `pageLocally`, which serves each row once and reports an
 * exact end.
 *
 * The fake below accepts only the documented request. It throws on any query
 * key other than `where` and `order`, and on any header the endpoint does not
 * document, so every test refuses a paging key sent upstream. It applies what
 * it does accept the way Xero does: a `Status=="…"` filter narrows the rows,
 * and If-Modified-Since on Accounts drops the rows modified before it. It
 * returns the whole matching collection on every call, as an endpoint that
 * does not page would.
 *
 * The fixtures are chosen so that a plausible wrong adapter changes the
 * result. Every third row is inactive (ARCHIVED accounts, DELETED rates), so
 * an adapter that narrows the collection by status serves fewer rows than
 * Xero has. The ids are scattered rather than sorted, so an adapter that
 * reorders rows by id no longer serves them in Xero's order.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { XeroClient } from '../../../../../../src/verticals/accounting/adapters/xero/client'
import { XeroAdapter } from '../../../../../../src/verticals/accounting/adapters/xero'
import type {
  AccountingAdapter,
  Credentials,
  QueryParams,
} from '../../../../../../src/verticals/accounting/adapter/interface'

const CREDS = { accessToken: 'tok', tenantId: 'ten' } as Credentials

// Typed as the router holds it (`request.adapter`), so parseListQuery reads its
// capabilities the same way the API path does.
const adapter: AccountingAdapter = new XeroAdapter({
  clientId: 'cid',
  clientSecret: 'secret',
  redirectUri: 'https://example.test/callback',
  scopes: ['accounting.settings.read'],
})

afterEach(() => vi.restoreAllMocks())

/** The only query keys getAccounts and getTaxRates document. */
const DOCUMENTED_QUERY_KEYS = new Set(['where', 'order'])

type Row = Record<string, unknown>

interface Call {
  path: string
  params: Record<string, unknown> | undefined
  headers: Record<string, string> | undefined
}

interface Case {
  method: 'listAccounts' | 'listTaxRates'
  endpoint: 'Accounts' | 'TaxRates'
  /** The request headers this endpoint documents, beyond auth and tenant. */
  headers: readonly string[]
  /** The upstream rows, in Xero's order. */
  rows: (n: number) => Row[]
  /** The canonical id each upstream row becomes. */
  id: (row: Row) => string
}

/**
 * A distinct, unsorted number for each row index: 7919 and 10007 are coprime,
 * so i ↦ 7919·i mod 10007 is one-to-one below 10007, and it is not monotonic.
 */
const scatter = (i: number) => String((i * 7919) % 10007).padStart(5, '0')

const OLD = Date.UTC(2025, 0, 1)
const RECENT = Date.UTC(2026, 5, 1)
const SINCE = new Date(Date.UTC(2026, 0, 1))

/** Odd rows were modified after SINCE, even rows before it. */
const modifiedAt = (i: number) => (i % 2 === 1 ? RECENT : OLD)

const CASES: Case[] = [
  {
    method: 'listAccounts',
    endpoint: 'Accounts',
    headers: ['If-Modified-Since'],
    rows: (n) =>
      Array.from({ length: n }, (_, i) => ({
        AccountID: `acc-${scatter(i)}`,
        Code: String(200 + i),
        Name: `Account ${i}`,
        Type: 'REVENUE',
        Class: 'REVENUE',
        Status: i % 3 === 2 ? 'ARCHIVED' : 'ACTIVE',
        Description: '',
        CurrencyCode: 'GBP',
        // Xero serialises this field in the .NET form, not ISO.
        UpdatedDateUTC: `/Date(${modifiedAt(i)}+0000)/`,
      })),
    id: (r) => r['AccountID'] as string,
  },
  {
    method: 'listTaxRates',
    endpoint: 'TaxRates',
    headers: [],
    rows: (n) =>
      Array.from({ length: n }, (_, i) => ({
        Name: `Rate ${i}`,
        TaxType: `TAX${scatter(i)}`,
        EffectiveRate: i % 20,
        DisplayTaxRate: i % 20,
        Status: i % 3 === 2 ? 'DELETED' : 'ACTIVE',
        TaxComponents: [],
      })),
    id: (r) => r['TaxType'] as string,
  },
]

function dotNetMillis(value: unknown): number {
  const m = /^\/Date\((-?\d+)/.exec(String(value))
  if (!m) throw new Error(`fake xero: not a .NET date: ${String(value)}`)
  return Number(m[1])
}

/** A fake Xero endpoint that returns its whole matching collection on every call. */
function fakeUpstream(c: Case, rows: Row[]): Call[] {
  const calls: Call[] = []
  vi.spyOn(XeroClient.prototype, 'get').mockImplementation(
    async (path: string, params?: Record<string, unknown>, headers?: Record<string, string>) => {
      calls.push({ path, params, headers })
      if (path !== c.endpoint) throw new Error(`fake xero: unexpected path ${path}`)
      for (const key of Object.keys(params ?? {})) {
        if (!DOCUMENTED_QUERY_KEYS.has(key)) {
          throw new Error(`fake xero: ${path} documents no query key ${key}`)
        }
      }
      for (const name of Object.keys(headers ?? {})) {
        if (!c.headers.includes(name)) {
          throw new Error(`fake xero: ${path} documents no header ${name}`)
        }
      }
      let out = rows
      const where = params?.['where']
      if (where !== undefined) {
        const m = /^Status=="([A-Z]+)"$/.exec(String(where))
        if (!m) {
          throw new Error(`fake xero: this fake applies only Status=="…", not ${String(where)}`)
        }
        out = out.filter((r) => r['Status'] === m[1])
      }
      const since = headers?.['If-Modified-Since']
      if (since !== undefined) {
        const t = Date.parse(since)
        out = out.filter((r) => dotNetMillis(r['UpdatedDateUTC']) >= t)
      }
      return { [c.endpoint]: out } as never
    },
  )
  return calls
}

function call(c: Case, params: QueryParams) {
  return adapter[c.method]!(CREDS, params) as Promise<Array<{ id?: string | null }>>
}

async function drive(c: Case, limit: number, pages: number, extra: Partial<QueryParams> = {}) {
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  const local: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params: QueryParams = withPageSink({ ...extra, page, limit })
    const got = await call(c, params)
    ids.push(...got.map((r) => r.id as string))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    totals.push(meta?.totalCount)
    local.push(meta?.pagedLocally)
  }
  return { ids, hasMore, totals, local }
}

describe.each(CASES)('Xero $method pages a whole-collection response locally', (c) => {
  const L = 4
  const allIds = (rows: Row[]) => rows.map(c.id)

  it('serves N = 2L + 1 rows once each across pages 1..3, like the sync worker', async () => {
    const rows = c.rows(2 * L + 1)
    // The fixture must hold both statuses and an unsorted id order, or the
    // two wrong adapters described at the top of this file would pass.
    expect(new Set(rows.map((r) => r['Status'])).size).toBe(2)
    expect(allIds(rows)).not.toEqual([...allIds(rows)].sort())
    fakeUpstream(c, rows)
    const { ids, hasMore, totals, local } = await drive(c, L, 3)
    expect(ids).toEqual(allIds(rows))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
    expect(local).toEqual([true, true, true])
  })

  it('page 2 sends the same documented request as page 1: the bare GET, no query keys', async () => {
    const rows = c.rows(2 * L + 1)
    const calls = fakeUpstream(c, rows)
    await call(c, withPageSink({ page: 1, limit: L }))
    const got = await call(c, withPageSink({ page: 2, limit: L }))
    expect(got.map((r) => r.id)).toEqual(allIds(rows).slice(L, 2 * L))
    expect(calls).toHaveLength(2)
    expect(calls[1]!.path).toBe(c.endpoint)
    expect(calls[1]).toEqual(calls[0])
    expect(calls[0]!.params ?? {}).toEqual({})
  })

  it('ends exactly at N = 2L: page 2 is full and reports no more', async () => {
    const rows = c.rows(2 * L)
    fakeUpstream(c, rows)
    const { ids, hasMore } = await drive(c, L, 2)
    expect(ids).toEqual(allIds(rows))
    expect(hasMore).toEqual([true, false])
  })

  it('serves every row at the worker size of 500, past what one page holds', async () => {
    const rows = c.rows(1001)
    fakeUpstream(c, rows)
    const { ids, hasMore } = await drive(c, 500, 3)
    expect(ids).toEqual(allIds(rows))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a limit above the router maximum is clamped and still serves every row, through listPage too', async () => {
    const rows = c.rows(1001)
    fakeUpstream(c, rows)
    const ids: string[] = []
    const hasMore: Array<boolean | undefined> = []
    const served: string[] = []
    const metaLimits: number[] = []
    const metaHasMore: Array<boolean | null> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '9999' }, adapter)
      expect(params.limit).toBe(500)
      const got = await call(c, params)
      ids.push(...got.map((r) => r.id as string))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      // The API path at this size: listPage serves at the size the adapter
      // reports it paged by, so a page size reported below 500 would cut
      // every page short while `page` still strides by 500.
      const env = listPage(got, params, adapter.platform)
      served.push(...env.data.map((r) => r.id as string))
      metaLimits.push(env.meta.limit)
      metaHasMore.push(env.meta.hasMore)
    }
    expect(ids).toEqual(allIds(rows))
    expect(hasMore).toEqual([true, true, false])
    expect(served).toEqual(allIds(rows))
    expect(metaLimits).toEqual([500, 500, 500])
    expect(metaHasMore).toEqual([true, true, false])
  })

  it('pages at the limit parseListQuery delivers from a query string', async () => {
    const rows = c.rows(2 * L + 1)
    fakeUpstream(c, rows)
    const p2 = parseListQuery({ page: '2', limit: String(L) }, adapter)
    const got = await call(c, p2)
    expect(got.map((r) => r.id)).toEqual(allIds(rows).slice(L, 2 * L))
    expect(readUpstreamPage(p2)?.hasMore).toBe(true)
  })

  it('API path: parseListQuery + listPage report meta.hasMore exactly', async () => {
    const rows = c.rows(2 * L + 1)
    fakeUpstream(c, rows)
    const ids: string[] = []
    const hasMore: Array<boolean | null> = []
    const totals: Array<number | null> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: String(L) }, adapter)
      const env = listPage(await call(c, params), params, adapter.platform)
      ids.push(...env.data.map((r) => r.id as string))
      hasMore.push(env.meta.hasMore)
      totals.push(env.meta.totalCount)
    }
    expect(ids).toEqual(allIds(rows))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
  })

  it('API path: a full last page at N = 2L reports hasMore false, not unknown', async () => {
    fakeUpstream(c, c.rows(2 * L))
    const params = parseListQuery({ page: '2', limit: String(L) }, adapter)
    const env = listPage(await call(c, params), params, adapter.platform)
    expect(env.data).toHaveLength(L)
    expect(env.meta.hasMore).toBe(false)
  })

  it('a caller that names no limit gets every row, already in hand', async () => {
    const rows = c.rows(250)
    fakeUpstream(c, rows)
    const params = withPageSink({})
    const got = await call(c, params)
    expect(got.map((r) => r.id)).toEqual(allIds(rows))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

describe('updated_after on the two whole-collection reads', () => {
  const [ACCOUNTS, TAX_RATES] = CASES as [Case, Case]
  const L = 4

  it('listAccounts sends it as If-Modified-Since and pages only the accounts Xero returns for it', async () => {
    // 4L + 3 rows, of which the 2L + 1 odd ones were modified after SINCE.
    const rows = ACCOUNTS.rows(4 * L + 3)
    const recent = rows.filter((_, i) => i % 2 === 1)
    expect(recent).toHaveLength(2 * L + 1)
    const calls = fakeUpstream(ACCOUNTS, rows)
    const { ids, hasMore, totals } = await drive(ACCOUNTS, L, 3, { updatedAfter: SINCE })
    expect(calls.map((x) => x.headers?.['If-Modified-Since'])).toEqual([
      SINCE.toISOString(),
      SINCE.toISOString(),
      SINCE.toISOString(),
    ])
    expect(ids).toEqual(recent.map(ACCOUNTS.id))
    // The total is the filtered query's, not the whole chart's.
    expect(totals).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('listTaxRates cannot narrow it, so it sends no header and serves every rate with the table total', async () => {
    // getTaxRates documents no If-Modified-Since and a TaxRate has no
    // UpdatedDateUTC. The fake throws on the header, as undocumented.
    const rows = TAX_RATES.rows(2 * L + 1)
    const calls = fakeUpstream(TAX_RATES, rows)
    const { ids, totals, hasMore } = await drive(TAX_RATES, L, 3, { updatedAfter: SINCE })
    expect(calls.every((x) => x.headers === undefined)).toBe(true)
    expect(ids).toEqual(rows.map(TAX_RATES.id))
    expect(totals).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
    expect(hasMore).toEqual([true, true, false])
  })
})
