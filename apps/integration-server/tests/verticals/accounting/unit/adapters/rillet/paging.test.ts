/**
 * Rillet list paging: every list serves the caller's page `page` at `limit`.
 *
 * Rillet pages by opaque cursor. Getting started
 * (https://docs.api.rillet.com/docs/getting-started.md):
 *   "In order to access the next page, the cursor is passed with the `cursor`
 *    query parameter. Subsequent calls will also return a next cursor or no
 *    cursor if this is the last page. Cursor values are valid for 2 hours. If
 *    an invalid or expired cursor is passed, a new pagination sequence will
 *    begin from the first page."
 *   "Page size is defined by the `limit` query parameter. If no value is
 *    defined, a default size of 25 is used. The maximum allowed value for the
 *    page size is 100."
 * The v4.0 OpenAPI pages (the version the adapter sends in
 * X-Rillet-API-Version) give each list's 200 body under its own key, beside a
 * `pagination` object holding `next_cursor`: `invoices`, `bills`,
 * `customers`, `vendors`, `journal_entries`, `bank_transactions`, `charges`,
 * `credit_memos`. None has a `data` key. Two lists take no paging parameters
 * and have no `pagination` object, so they return the whole collection:
 *   GET /accounts (list-all-accounts.md): "Returns the chart of accounts for
 *     the organization tied to the API credentials." Only `updated.gt`.
 *   GET /tax-rates (list-all-tax-rates.md): "Returns all available tax
 *     rates." Only `country`.
 * Getting started says keyset paging covers "all GET endpoints that return
 * lists of objects", so those two follow a `next_cursor` if one comes back,
 * and never invent one.
 *
 * The adapter used to send `limit` and never `cursor`, so page 2 of every
 * list was page 1 again, and it read the rows from `data`, so against the
 * real API every list was empty. Contacts also sent the caller's limit to
 * both /customers and /vendors and returned up to twice the limit.
 *
 * The fake upstream below honours ONLY the documented parameters of each
 * endpoint (`limit`, `cursor` and `updated.gt`; neither of the first two on
 * /accounts and /tax-rates), answers under the documented keys, rejects a
 * limit above 100 with a 400, and restarts from the first page on a cursor it
 * did not mint for that list, as the docs say the real API does.
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
import { RilletAdapter } from '../../../../../../src/verticals/accounting/adapters/rillet/index'

const CREDS = { accessToken: 'rillet-api-key' }
const adapter = new RilletAdapter({ apiKey: 'rillet-api-key' })

const MAX = 100
const DEFAULT_LIMIT = 25

// ── the fake upstream ────────────────────────────────────────────────────

interface Recorded {
  url: string
  params: Record<string, unknown>
}

interface Row {
  id: string
  updated_at: string
}

/** Each cursor-paged list: its path, and the key its rows come back under. */
const CURSOR_LISTS: Record<string, string> = {
  invoices: 'invoices',
  bills: 'bills',
  customers: 'customers',
  vendors: 'vendors',
  'journal-entries': 'journal_entries',
  'bank-transactions': 'bank_transactions',
  charges: 'charges',
  'credit-memos': 'credit_memos',
}

/** The two whole-collection lists: their key, and the one filter each documents. */
const WHOLE_LISTS: Record<string, { key: string; filter: string }> = {
  accounts: { key: 'accounts', filter: 'updated.gt' },
  'tax-rates': { key: 'tax_rates', filter: 'country' },
}

const day = (i: number): string => new Date(Date.UTC(2026, 0, 1 + i)).toISOString()

function rows(prefix: string, n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, updated_at: day(i) }))
}

function badRequest(detail: string): Error {
  return Object.assign(new Error(detail), {
    response: { status: 400, data: { title: 'Bad Request', status: 400, detail } },
  })
}

function encodeCursor(path: string, offset: number): string {
  return Buffer.from(JSON.stringify({ path, offset })).toString('base64url')
}

/** A cursor this list minted, else the first page ("a new pagination sequence"). */
function decodeCursor(path: string, cursor: unknown): number {
  if (cursor === undefined) return 0
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8')) as {
      path?: unknown
      offset?: unknown
    }
    return parsed.path === path && typeof parsed.offset === 'number' ? parsed.offset : 0
  } catch {
    return 0
  }
}

type Dataset = Partial<Record<string, number>>

interface FakeOptions {
  /**
   * Page /accounts and /tax-rates by cursor at this size. Their v4.0 pages
   * document no paging, but getting started says keyset paging covers "all
   * GET endpoints that return lists of objects", so the adapter must not drop
   * rows if the live API pages them anyway.
   */
  wholePageSize?: number
}

type Get = (url: string, config?: { params?: Record<string, unknown> }) => Promise<unknown>

/** Answer every request with `get`, recording each one. */
function scripted(get: Get): Recorded[] {
  const requests: Recorded[] = []
  const recording: Get = async (url, config) => {
    requests.push({ url, params: { ...(config?.params ?? {}) } })
    return get(url, config)
  }
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: recording,
  })) as unknown as typeof axios.create)
  return requests
}

function fakeUpstream(data: Dataset, options: FakeOptions = {}): Recorded[] {
  return scripted(async (url, config) => {
    const params = { ...(config?.params ?? {}) }
    const prefix = `${url}_`
    const since = params['updated.gt']
    const all = rows(prefix, data[url] ?? 0)
    const updated = (list: Row[]): Row[] =>
      since === undefined ? list : list.filter((r) => r.updated_at > String(since))

    const whole = WHOLE_LISTS[url]
    if (whole) {
      const matching = whole.filter === 'updated.gt' ? updated(all) : all
      const size = options.wholePageSize
      // As documented: no limit, no cursor, no pagination object, every row.
      if (size === undefined) return { data: { [whole.key]: matching } }
      const offset = decodeCursor(url, params['cursor'])
      const end = Math.min(offset + size, matching.length)
      return {
        data: {
          [whole.key]: matching.slice(offset, end),
          pagination: end < matching.length ? { next_cursor: encodeCursor(url, end) } : {},
        },
      }
    }

    const key = CURSOR_LISTS[url]
    if (!key) throw new Error(`fake upstream: no route for ${url}`)
    const raw = params['limit']
    const limit = raw === undefined ? DEFAULT_LIMIT : Number(raw)
    if (!Number.isInteger(limit) || limit < 1) throw badRequest(`limit ${String(raw)}`)
    if (limit > MAX) throw badRequest(`limit ${limit} is greater than ${MAX}`)
    const matching = updated(all)
    const offset = decodeCursor(url, params['cursor'])
    const page = matching.slice(offset, offset + limit)
    const end = offset + page.length
    return {
      data: {
        [key]: page,
        pagination: end < matching.length ? { next_cursor: encodeCursor(url, end) } : {},
      },
    }
  })
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

// ── driving the adapter like the worker ──────────────────────────────────

type ListMethod =
  | 'listInvoices'
  | 'listBills'
  | 'listContacts'
  | 'listAccounts'
  | 'listJournals'
  | 'listTransactions'
  | 'listTaxRates'
  | 'listCreditMemos'
  | 'listExpenses'

async function drive(
  method: ListMethod,
  limit: number,
  pages: number,
  extra: Partial<QueryParams> = {},
) {
  const served: string[][] = []
  const hasMore: Array<boolean | undefined> = []
  const pageSize: Array<number | undefined> = []
  const pagedLocally: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params: QueryParams = withPageSink({ page, limit, ...extra })
    const got = (await adapter[method](CREDS, params)) as Array<{ id?: string }>
    served.push(got.map((r) => String(r.id)))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    pageSize.push(meta?.pageSize)
    pagedLocally.push(meta?.pagedLocally)
  }
  return { served, hasMore, pageSize, pagedLocally }
}

const seq = (prefix: string, n: number, from = 0): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${from + i}`)

const onPath = (requests: Recorded[], url: string): Recorded[] =>
  requests.filter((r) => r.url === url)

describe('RilletAdapter declares the documented page maximum', () => {
  it('declares capabilities.maxPageSize = 100', () => {
    expect(adapter.capabilities?.maxPageSize).toBe(MAX)
  })
})

// ── the six single-cursor lists ──────────────────────────────────────────

interface CursorCase {
  method: Exclude<ListMethod, 'listContacts' | 'listAccounts' | 'listTaxRates'>
  path: string
}

const CURSOR_CASES: CursorCase[] = [
  { method: 'listInvoices', path: 'invoices' },
  { method: 'listBills', path: 'bills' },
  { method: 'listJournals', path: 'journal-entries' },
  { method: 'listTransactions', path: 'bank-transactions' },
  { method: 'listCreditMemos', path: 'credit-memos' },
  { method: 'listExpenses', path: 'charges' },
]

describe.each(CURSOR_CASES)('RilletAdapter.$method pages $path by next_cursor', (c) => {
  const prefix = `${c.path}_`

  it('serves 2L + 1 rows once each across pages 1..3, and reports the end', async () => {
    const L = 3
    const N = 2 * L + 1
    fakeUpstream({ [c.path]: N })
    const { served, hasMore, pageSize } = await drive(c.method, L, 3)
    expect(served).toEqual([seq(prefix, L), seq(prefix, L, L), seq(prefix, 1, 2 * L)])
    expect(served.flat()).toEqual(seq(prefix, N))
    expect(hasMore).toEqual([true, true, false])
    expect(pageSize).toEqual([undefined, undefined, undefined])
  })

  it("sends page 1's next_cursor as `cursor` on page 2, at the caller's limit", async () => {
    const requests = fakeUpstream({ [c.path]: 7 })
    await drive(c.method, 3, 2)
    const calls = onPath(requests, c.path)
    expect(calls.map((r) => r.params)).toEqual([
      { limit: 3 },
      { limit: 3, cursor: encodeCursor(c.path, 3) },
    ])
  })

  it('ends on page 2 when N = 2L, and serves page 3 empty without a request', async () => {
    const L = 3
    const requests = fakeUpstream({ [c.path]: 2 * L })
    const { served, hasMore } = await drive(c.method, L, 3)
    expect(served.flat()).toEqual(seq(prefix, 2 * L))
    expect(served[2]).toEqual([])
    expect(hasMore).toEqual([true, false, false])
    expect(onPath(requests, c.path)).toHaveLength(2)
  })

  it('clamps a limit above the documented maximum, reports the size it sent, and serves every row', async () => {
    const asked = MAX + 1
    const N = 2 * MAX + 1
    const requests = fakeUpstream({ [c.path]: N })
    const { served, hasMore, pageSize } = await drive(c.method, asked, 3)
    expect(served.map((p) => p.length)).toEqual([MAX, MAX, 1])
    expect(served.flat()).toEqual(seq(prefix, N))
    expect(hasMore).toEqual([true, true, false])
    expect(pageSize).toEqual([MAX, MAX, MAX])
    for (const r of onPath(requests, c.path)) expect(r.params['limit']).toBe(MAX)
  })

  it('pages at the limit parseListQuery delivers, capped at the declared maximum', async () => {
    const requests = fakeUpstream({ [c.path]: 250 })
    const page1 = parseListQuery({ limit: '250' }, adapter)
    const page2 = parseListQuery({ limit: '250', page: '2' }, adapter)
    expect(page1.limit).toBe(MAX)
    expect((await adapter[c.method](CREDS, page1)).map((r) => r.id)).toEqual(seq(prefix, MAX))
    expect((await adapter[c.method](CREDS, page2)).map((r) => r.id)).toEqual(seq(prefix, MAX, MAX))
    for (const r of onPath(requests, c.path)) expect(r.params['limit']).toBe(MAX)
  })

  it('reports meta.hasMore through parseListQuery + listPage', async () => {
    fakeUpstream({ [c.path]: 5 })
    const p1 = parseListQuery({ limit: '2', page: '1' }, adapter)
    const env1 = listPage<{ id?: string }>(await adapter[c.method](CREDS, p1), p1, 'rillet')
    expect(env1.data.map((r) => r.id)).toEqual(seq(prefix, 2))
    expect(env1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const env3 = listPage<{ id?: string }>(await adapter[c.method](CREDS, p3), p3, 'rillet')
    expect(env3.data.map((r) => r.id)).toEqual(seq(prefix, 1, 4))
    expect(env3.meta.hasMore).toBe(false)
  })

  it('sends updated.gt on every page, and walks a filtered list apart from an unfiltered one', async () => {
    const requests = fakeUpstream({ [c.path]: 9 })
    const updatedAfter = new Date(day(2))
    const { served, hasMore } = await drive(c.method, 3, 3, { updatedAfter })
    expect(served.flat()).toEqual(seq(prefix, 6, 3))
    expect(hasMore).toEqual([true, false, false])
    const calls = onPath(requests, c.path)
    for (const r of calls) expect(r.params['updated.gt']).toBe(day(2))
    // The unfiltered list is its own walk: the filtered one ended on page 2,
    // and the unfiltered one has a page 3.
    const unfiltered = await adapter[c.method](CREDS, withPageSink({ page: 3, limit: 3 }))
    expect(unfiltered.map((r) => r.id)).toEqual(seq(prefix, 3, 6))
  })

  it('keeps one connection’s walk apart from another’s', async () => {
    const requests = fakeUpstream({ [c.path]: 7 })
    await adapter[c.method](CREDS, withPageSink({ page: 1, limit: 3 }))
    const other = { accessToken: 'another-rillet-api-key' }
    await adapter[c.method](other, withPageSink({ page: 2, limit: 3 }))
    // The second connection walks its own chain from page 1.
    const calls = onPath(requests, c.path)
    expect(calls).toHaveLength(3)
    expect(calls[1]!.params['cursor']).toBeUndefined()
    expect(calls[2]!.params['cursor']).toBe(encodeCursor(c.path, 3))
  })

  it('walks the list at one limit apart from the same list at another', async () => {
    // Page 2 at limit 5 starts at row 5. The cursor that starts page 2 at
    // limit 3 points at row 3, so a walk keyed without the size serves 3..7.
    fakeUpstream({ [c.path]: 10 })
    await drive(c.method, 3, 2)
    const page2 = await adapter[c.method](CREDS, withPageSink({ page: 2, limit: 5 }))
    expect(page2.map((r) => r.id)).toEqual(seq(prefix, 5, 5))
  })

  it('walks the list apart from every other list on the connection', async () => {
    // Another list's cursor sent here is one Rillet did not mint for this
    // list, so it would silently restart at page 1 and serve page 1 as page 2.
    const other = CURSOR_CASES[(CURSOR_CASES.indexOf(c) + 1) % CURSOR_CASES.length]!
    fakeUpstream({ [other.path]: 4, [c.path]: 10 })
    await drive(other.method, 3, 2)
    const page2 = await adapter[c.method](CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(page2.map((r) => r.id)).toEqual(seq(prefix, 3, 3))
  })

  it('pages at the documented default of 25 when the caller names no limit', async () => {
    const requests = fakeUpstream({ [c.path]: 30 })
    const page1 = withPageSink({ page: 1 })
    expect((await adapter[c.method](CREDS, page1)).map((r) => r.id)).toEqual(seq(prefix, 25))
    expect(readUpstreamPage(page1)?.hasMore).toBe(true)
    const page2 = withPageSink({ page: 2 })
    expect((await adapter[c.method](CREDS, page2)).map((r) => r.id)).toEqual(seq(prefix, 5, 25))
    expect(readUpstreamPage(page2)?.hasMore).toBe(false)
    expect(onPath(requests, c.path).map((r) => r.params)).toEqual([
      { limit: DEFAULT_LIMIT },
      { limit: DEFAULT_LIMIT, cursor: encodeCursor(c.path, 25) },
    ])
  })
})

// ── reading the end of a cursor-paged list ───────────────────────────────

describe('RilletAdapter reads the end of a list from pagination.next_cursor', () => {
  const invoice = (id: string): Row => ({ id, updated_at: day(0) })

  it('ends the list on an empty next_cursor instead of sending `cursor=`', async () => {
    const requests = scripted(async () => ({
      data: { invoices: [invoice('a')], pagination: { next_cursor: '' } },
    }))
    const page1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listInvoices(CREDS, page1)).map((r) => r.id)).toEqual(['a'])
    expect(readUpstreamPage(page1)?.hasMore).toBe(false)
    expect(await adapter.listInvoices(CREDS, withPageSink({ page: 2, limit: 1 }))).toEqual([])
    expect(requests).toEqual([{ url: 'invoices', params: { limit: 1 } }])
  })

  it('ends the list on a response with no pagination object', async () => {
    // The v4.0 invoices page marks only the rows as required in its response.
    scripted(async () => ({ data: { invoices: [invoice('a')] } }))
    const page1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listInvoices(CREDS, page1)).map((r) => r.id)).toEqual(['a'])
    expect(readUpstreamPage(page1)?.hasMore).toBe(false)
  })

  it('fails instead of looping when next_cursor repeats the cursor it was sent', async () => {
    const requests = scripted(async (_url, config) => ({
      data: {
        invoices: [invoice(`i-${String(config?.params?.['cursor'] ?? 'first')}`)],
        pagination: { next_cursor: 'SAME' },
      },
    }))
    const page1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listInvoices(CREDS, page1)).map((r) => r.id)).toEqual(['i-first'])
    expect(readUpstreamPage(page1)?.hasMore).toBe(true)
    // Page 2 is fetched with SAME and names SAME again: page 3 would be page 2.
    await expect(adapter.listInvoices(CREDS, withPageSink({ page: 2, limit: 1 }))).rejects.toThrow(
      /loop/,
    )
    expect(requests).toHaveLength(2)
  })
})

// ── contacts: customers, then vendors, as one stream ─────────────────────

describe('RilletAdapter.listContacts streams customers, then vendors, by cursor', () => {
  /** 3 customers then 2 vendors: N = 5 = 2L + 1 at L = 2. */
  const ALL = ['customers_0', 'customers_1', 'customers_2', 'vendors_0', 'vendors_1']

  it('serves 2L + 1 rows once each across pages 1..3, and reports the end', async () => {
    fakeUpstream({ customers: 3, vendors: 2 })
    const { served, hasMore, pagedLocally } = await drive('listContacts', 2, 3)
    expect(served).toEqual([ALL.slice(0, 2), ALL.slice(2, 4), ALL.slice(4)])
    expect(hasMore).toEqual([true, true, false])
    expect(pagedLocally).toEqual([true, true, true])
  })

  it('sends each list its own next_cursor, never a customer cursor to /vendors', async () => {
    const requests = fakeUpstream({ customers: 3, vendors: 3 })
    const { served } = await drive('listContacts', 2, 4)
    expect(served.flat()).toEqual([...seq('customers_', 3), ...seq('vendors_', 3)])
    expect(onPath(requests, 'customers').map((r) => r.params)).toEqual([
      { limit: 2 },
      { limit: 2, cursor: encodeCursor('customers', 2) },
    ])
    expect(onPath(requests, 'vendors').map((r) => r.params)).toEqual([
      { limit: 2 },
      { limit: 2, cursor: encodeCursor('vendors', 2) },
    ])
  })

  it('never serves more than the limit on a page', async () => {
    fakeUpstream({ customers: 4, vendors: 4 })
    const { served, hasMore } = await drive('listContacts', 3, 4)
    expect(served.map((p) => p.length)).toEqual([3, 3, 2, 0])
    expect(served.flat()).toEqual([...seq('customers_', 4), ...seq('vendors_', 4)])
    expect(hasMore).toEqual([true, true, false, false])
  })

  it('ends on page 2 when N = 2L', async () => {
    fakeUpstream({ customers: 3, vendors: 1 })
    const { served, hasMore } = await drive('listContacts', 2, 3)
    expect(served.flat()).toEqual([...seq('customers_', 3), 'vendors_0'])
    expect(served[2]).toEqual([])
    expect(hasMore).toEqual([true, false, false])
  })

  it('serves vendors alone when there are no customers, and customers alone when there are no vendors', async () => {
    fakeUpstream({ customers: 0, vendors: 5 })
    const vendorsOnly = await drive('listContacts', 2, 3)
    expect(vendorsOnly.served.flat()).toEqual(seq('vendors_', 5))
    expect(vendorsOnly.hasMore).toEqual([true, true, false])

    vi.restoreAllMocks()
    _resetCursorPager()
    fakeUpstream({ customers: 5, vendors: 0 })
    const customersOnly = await drive('listContacts', 2, 3)
    expect(customersOnly.served.flat()).toEqual(seq('customers_', 5))
    expect(customersOnly.hasMore).toEqual([true, true, false])
  })

  it('serves a limit above the documented maximum in full, from upstream pages of 100', async () => {
    const L = MAX + 1
    const N = 2 * L + 1
    const requests = fakeUpstream({ customers: N - 3, vendors: 3 })
    const { served, hasMore } = await drive('listContacts', L, 3)
    expect(served.map((p) => p.length)).toEqual([L, L, 1])
    expect(served.flat()).toEqual([...seq('customers_', N - 3), ...seq('vendors_', 3)])
    expect(hasMore).toEqual([true, true, false])
    for (const r of requests) expect(r.params['limit']).toBe(MAX)
  })

  it('pages at the limit parseListQuery delivers, and reports meta.hasMore', async () => {
    const requests = fakeUpstream({ customers: 150, vendors: 60 })
    const p1 = parseListQuery({ limit: '250' }, adapter)
    expect(p1.limit).toBe(MAX)
    const env1 = listPage(await adapter.listContacts(CREDS, p1), p1, 'rillet')
    expect(env1.data.map((r) => r.id)).toEqual(seq('customers_', 100))
    expect(env1.meta.hasMore).toBe(true)
    const p2 = parseListQuery({ limit: '250', page: '2' }, adapter)
    const env2 = listPage(await adapter.listContacts(CREDS, p2), p2, 'rillet')
    expect(env2.data.map((r) => r.id)).toEqual([
      ...seq('customers_', 50, 100),
      ...seq('vendors_', 50),
    ])
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '250', page: '3' }, adapter)
    const env3 = listPage(await adapter.listContacts(CREDS, p3), p3, 'rillet')
    expect(env3.data.map((r) => r.id)).toEqual(seq('vendors_', 10, 50))
    expect(env3.meta.hasMore).toBe(false)
    for (const r of requests) expect(r.params['limit']).toBe(MAX)
  })

  it('sends updated.gt to both lists', async () => {
    const requests = fakeUpstream({ customers: 4, vendors: 4 })
    const { served } = await drive('listContacts', 3, 2, { updatedAfter: new Date(day(1)) })
    expect(served.flat()).toEqual([...seq('customers_', 2, 2), ...seq('vendors_', 2, 2)])
    expect(requests.length).toBeGreaterThan(0)
    for (const r of requests) expect(r.params['updated.gt']).toBe(day(1))
  })

  it('keeps one connection’s walk apart from another’s', async () => {
    const requests = fakeUpstream({ customers: 5, vendors: 0 })
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 2 }))
    const before = requests.length
    const other = { accessToken: 'another-rillet-api-key' }
    const page2 = await adapter.listContacts(other, withPageSink({ page: 2, limit: 2 }))
    expect(page2.map((r) => r.id)).toEqual(['customers_2', 'customers_3'])
    // The second connection starts from the first customer page under its own
    // key, instead of continuing from the first connection's rows.
    const theirs = requests.slice(before)
    expect(theirs[0]).toEqual({ url: 'customers', params: { limit: 2 } })
  })

  it('walks a filtered stream apart from an unfiltered one', async () => {
    // Filtered, the stream is customers_2..3 then vendors_2..3, so its page 2
    // starts at vendors_3. Unfiltered, page 2 starts at customers_3.
    fakeUpstream({ customers: 4, vendors: 4 })
    await drive('listContacts', 3, 1, { updatedAfter: new Date(day(1)) })
    const page2 = await adapter.listContacts(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(page2.map((r) => r.id)).toEqual(['customers_3', 'vendors_0', 'vendors_1'])
  })

  it('maps customers as customers and vendors as suppliers', async () => {
    fakeUpstream({ customers: 2, vendors: 2 })
    const got = await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(got.map((r) => [r.id, r.isCustomer, r.isSupplier])).toEqual([
      ['customers_0', true, false],
      ['customers_1', true, false],
      ['vendors_0', false, true],
      ['vendors_1', false, true],
    ])
  })

  it('pages at the documented default of 25 when the caller names no limit', async () => {
    const requests = fakeUpstream({ customers: 30, vendors: 0 })
    const page1 = withPageSink({ page: 1 })
    expect((await adapter.listContacts(CREDS, page1)).map((r) => r.id)).toEqual(
      seq('customers_', 25),
    )
    expect(readUpstreamPage(page1)?.hasMore).toBe(true)
    const page2 = withPageSink({ page: 2 })
    expect((await adapter.listContacts(CREDS, page2)).map((r) => r.id)).toEqual(
      seq('customers_', 5, 25),
    )
    expect(readUpstreamPage(page2)?.hasMore).toBe(false)
    for (const r of requests) expect(r.params['limit']).toBe(DEFAULT_LIMIT)
  })

  it('fails instead of looping when a list’s next_cursor repeats the cursor it was sent', async () => {
    // The stream's positions are objects, so the row pager cannot see the
    // repeat by identity; the adapter has to.
    const requests = scripted(async (url, config) => ({
      data: {
        [url]: [{ id: `${url}-${String(config?.params?.['cursor'] ?? 'first')}` }],
        pagination: { next_cursor: 'SAME' },
      },
    }))
    await expect(adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 3 }))).rejects.toThrow(
      /loop/,
    )
    expect(requests.map((r) => r.params)).toEqual([{ limit: 3 }, { limit: 3, cursor: 'SAME' }])
  })
})

// ── accounts and tax rates: the whole list, sliced locally ───────────────

interface WholeCase {
  method: 'listAccounts' | 'listTaxRates'
  path: string
  /** What every request of this list carries: only documented filters, never a size or cursor. */
  params: (updatedAfter?: Date) => Record<string, unknown>
  /** Whether `updated.gt` is documented here, and so narrows the rows. */
  filtered: boolean
}

const WHOLE_CASES: WholeCase[] = [
  {
    method: 'listAccounts',
    path: 'accounts',
    params: (updatedAfter) => (updatedAfter ? { 'updated.gt': updatedAfter.toISOString() } : {}),
    filtered: true,
  },
  { method: 'listTaxRates', path: 'tax-rates', params: () => ({}), filtered: false },
]

describe.each(WHOLE_CASES)('RilletAdapter.$method pages the whole $path list locally', (c) => {
  const prefix = `${c.path}_`

  it('serves 2L + 1 rows once each across pages 1..3, and reports the end', async () => {
    const L = 2
    fakeUpstream({ [c.path]: 2 * L + 1 })
    const { served, hasMore, pagedLocally } = await drive(c.method, L, 3)
    expect(served).toEqual([seq(prefix, 2), seq(prefix, 2, 2), seq(prefix, 1, 4)])
    expect(hasMore).toEqual([true, true, false])
    expect(pagedLocally).toEqual([true, true, true])
  })

  it('asks with no size or cursor, and only the filters it documents', async () => {
    const requests = fakeUpstream({ [c.path]: 5 })
    await adapter[c.method](CREDS, withPageSink({ page: 2, limit: 2 }))
    expect(requests).toEqual([{ url: c.path, params: c.params() }])

    vi.restoreAllMocks()
    const updatedAfter = new Date(day(1))
    const since = fakeUpstream({ [c.path]: 5 })
    await adapter[c.method](CREDS, withPageSink({ page: 1, limit: 2, updatedAfter }))
    expect(since).toEqual([{ url: c.path, params: c.params(updatedAfter) }])
  })

  it('follows next_cursor to the end when a response carries one, and serves every row', async () => {
    // Getting started says every list pages by cursor at a default of 25,
    // though this endpoint's own page documents neither. Follow a cursor
    // only when one comes back, with the same filters, and never send a size.
    const requests = fakeUpstream({ [c.path]: 60 }, { wholePageSize: DEFAULT_LIMIT })
    const updatedAfter = new Date(day(1))
    const expected = c.filtered ? seq(prefix, 58, 2) : seq(prefix, 60)
    const page1 = withPageSink({ page: 1, limit: MAX, updatedAfter })
    expect((await adapter[c.method](CREDS, page1)).map((r) => r.id)).toEqual(expected)
    expect(readUpstreamPage(page1)).toMatchObject({ hasMore: false, totalCount: expected.length })
    expect(requests.map((r) => r.params)).toEqual([
      c.params(updatedAfter),
      { ...c.params(updatedAfter), cursor: encodeCursor(c.path, 25) },
      { ...c.params(updatedAfter), cursor: encodeCursor(c.path, 50) },
    ])
  })

  it('fails instead of looping when the next_cursor chain comes round again', async () => {
    const key = c.path === 'accounts' ? 'accounts' : 'tax_rates'
    const after: Record<string, string> = { first: 'A', A: 'B', B: 'A' }
    let served = 0
    const requests = scripted(async (_url, config) => {
      // Bounded, so an adapter that follows the cycle fails here instead of
      // spinning until the test worker runs out of memory.
      if (++served > 10) throw new Error('fake upstream: runaway walk')
      const at = String(config?.params?.['cursor'] ?? 'first')
      return { data: { [key]: [{ id: at }], pagination: { next_cursor: after[at] } } }
    })
    await expect(adapter[c.method](CREDS, withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(
      /loop/,
    )
    expect(requests.map((r) => r.params['cursor'])).toEqual([undefined, 'A', 'B'])
  })

  it('reports the total, and ends on page 2 when N = 2L', async () => {
    fakeUpstream({ [c.path]: 4 })
    const params = withPageSink({ page: 2, limit: 2 })
    const got = await adapter[c.method](CREDS, params)
    expect(got.map((r) => r.id)).toEqual(seq(prefix, 2, 2))
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 4, hasMore: false })
    const { served, hasMore } = await drive(c.method, 2, 3)
    expect(served[2]).toEqual([])
    expect(hasMore).toEqual([true, false, false])
  })

  it('serves every row on page 1 at a limit above the list and above the maximum', async () => {
    fakeUpstream({ [c.path]: 7 })
    const { served, hasMore } = await drive(c.method, 500, 2)
    expect(served[0]).toEqual(seq(prefix, 7))
    expect(served[1]).toEqual([])
    expect(hasMore).toEqual([false, false])
  })

  it('pages at the limit parseListQuery delivers, and reports meta.hasMore', async () => {
    fakeUpstream({ [c.path]: 5 })
    const p2 = parseListQuery({ limit: '2', page: '2' }, adapter)
    const env2 = listPage(await adapter[c.method](CREDS, p2), p2, 'rillet')
    expect(env2.data.map((r) => r.id)).toEqual(seq(prefix, 2, 2))
    expect(env2.meta.hasMore).toBe(true)
    expect(env2.meta.totalCount).toBe(5)
    const p3 = parseListQuery({ limit: '2', page: '3' }, adapter)
    const env3 = listPage<{ id?: string }>(await adapter[c.method](CREDS, p3), p3, 'rillet')
    expect(env3.data.map((r) => r.id)).toEqual(seq(prefix, 1, 4))
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('RilletAdapter.listAccounts filters by updated.gt', () => {
  it('sends updated.gt and slices only the matching accounts', async () => {
    const requests = fakeUpstream({ accounts: 6 })
    const updatedAfter = new Date(day(1))
    const { served, hasMore } = await drive('listAccounts', 2, 3, { updatedAfter })
    expect(served).toEqual([seq('accounts_', 2, 2), seq('accounts_', 2, 4), []])
    expect(hasMore).toEqual([true, false, false])
    for (const r of requests) expect(r.params).toEqual({ 'updated.gt': day(1) })
  })
})

describe('RilletAdapter.getAccount reads the chart of accounts', () => {
  it('finds an account past the first page of any caller', async () => {
    fakeUpstream({ accounts: 150 })
    const account = await adapter.getAccount(CREDS, 'accounts_140')
    expect(account?.id).toBe('accounts_140')
  })

  it('finds an account past the first upstream page when the chart pages by cursor', async () => {
    const requests = fakeUpstream({ accounts: 150 }, { wholePageSize: DEFAULT_LIMIT })
    const account = await adapter.getAccount(CREDS, 'accounts_140')
    expect(account?.id).toBe('accounts_140')
    expect(requests).toHaveLength(6)
  })
})
