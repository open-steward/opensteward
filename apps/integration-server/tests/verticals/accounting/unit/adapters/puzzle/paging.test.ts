/**
 * Puzzle lists page by the caller's `page` and `limit`.
 *
 * Every list method sent `{ limit: min(limit, 100) }` and dropped `page`, so
 * page 2 was page 1 again: the sync worker re-fetched the first page until its
 * cap, and the API served it forever. On five of the six endpoints `limit` is
 * not even a parameter, so the size never reached Puzzle either.
 *
 * Puzzle's OpenAPI is embedded in each first-party reference page
 * (https://puzzle-api.readme.io/reference/<page>.md). It documents two
 * dialects, and no maximum for either size parameter:
 *
 *   count / after, answered with `pageInfo { endCursor, hasNextPage, total }`:
 *     GET /company/{id}/invoices      (invoicesapi)
 *     GET /company/{id}/bills         (billsapi)
 *     GET /company/{id}/customers     (customersapi)
 *     GET /company/{id}/vendors       (vendors-1)
 *     GET /company/{id}/transactions  (gettransactions)
 *
 *   limit / cursor, answered with `pageInfo { nextCursor }` (null at the end):
 *     GET /company/{id}/journalEntries  (journalentries-1)
 *
 * and GET /company/{id}/chartOfAccounts takes no paging parameter at all:
 * "By default, all accounts are returned" (chartofaccounts).
 *
 * GET /company/{id}/transactions also marks `startDate` and `endDate`
 * (YYYY-MM-DD) `"required": true` and filters on them.
 *
 * The fake upstream below honours only those documented parameters, ignores
 * any other (as a server does), refuses a transactions request without its
 * dates, and answers in the documented envelopes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import { PuzzleAdapter } from '../../../../../../src/verticals/accounting/adapters/puzzle'
import { PuzzleClient } from '../../../../../../src/verticals/accounting/adapters/puzzle/client'
import type {
  AccountingAdapter,
  Credentials,
  QueryParams,
} from '../../../../../../src/verticals/accounting/adapter/interface'

const COMPANY = 'co_7f3a'
const adapter = new PuzzleAdapter({
  clientId: 'client',
  clientSecret: 'secret',
  redirectUri: 'https://example.test/callback',
})
/** The adapter as the router holds it, for parseListQuery. */
const routed: AccountingAdapter = adapter
const creds = { accessToken: 'at-A', refreshToken: 'rt-A', tenantId: COMPANY } as Credentials

/** What Puzzle serves when no size parameter it knows arrives. Undocumented; any value past N will do. */
const SERVER_DEFAULT = 25

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

type Collection =
  | 'invoices'
  | 'bills'
  | 'transactions'
  | 'customers'
  | 'vendors'
  | 'journalEntries'
  | 'chartOfAccounts'
/** `timestamp` is a transaction's date, which startDate/endDate filter on. */
type Row = { id: string; timestamp?: string }
type Dataset = Partial<Record<Collection, Row[]>>

interface Call {
  collection: string
  params: Record<string, unknown> | undefined
  token: string
}

interface FakeOptions {
  /** `pageInfo.total` is nullable in the spec. */
  totalNull?: boolean
  /**
   * `pageInfo.total` has no description in the spec. 'page' makes it the
   * page's own row count, one reading the spec does not rule out.
   */
  totalOf?: 'collection' | 'page'
  /** Serve at most this many rows a page whatever `count` asks: a cap the spec does not document. */
  capAt?: number
  /** Answer `hasNextPage: true` with a null `endCursor`, which no walk can follow. */
  brokenCursor?: boolean
  /** A chain stuck in place: every page of this collection is empty and its endCursor is the `after` it was sent. */
  stuck?: Collection
}

function rows(prefix: string, n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${String(i + 1).padStart(3, '0')}`,
  }))
}

/** Opaque to the adapter: the fake decodes it, the adapter may only echo it back. */
function encodeCursor(collection: string, offset: number): string {
  return Buffer.from(`${collection}@${offset}`).toString('base64url')
}

function decodeCursor(collection: string, cursor: unknown): number {
  const [c, n] = Buffer.from(String(cursor), 'base64url').toString().split('@')
  if (c !== collection || n === undefined || !/^\d+$/.test(n))
    throw new Error(`400: cursor ${String(cursor)} is not a position in ${collection}`)
  return Number(n)
}

function sizeOf(raw: unknown): number {
  if (raw === undefined) return SERVER_DEFAULT
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) throw new Error(`400: size ${String(raw)} is not an integer`)
  return n
}

/**
 * Puzzle's list endpoints over `data` (or over the data each access token
 * sees), honouring only the documented parameters.
 */
function fakePuzzle(data: Dataset | ((token: string) => Dataset), options: FakeOptions = {}) {
  const calls: Call[] = []
  vi.spyOn(PuzzleClient.prototype, 'get').mockImplementation(async function (
    this: PuzzleClient,
    path: string,
    params?: Record<string, unknown>,
  ) {
    const auth = (this as unknown as { http: { defaults: { headers: Record<string, unknown> } } })
      .http.defaults.headers['Authorization']
    const token = String(auth).replace(/^Bearer /, '')
    const m = /^\/company\/([^/]+)\/([A-Za-z]+)$/.exec(path)
    if (!m || m[1] !== COMPANY) throw new Error(`404: unexpected path ${path}`)
    const collection = m[2] as Collection
    calls.push({ collection, params: params === undefined ? undefined : { ...params }, token })
    let all = (typeof data === 'function' ? data(token) : data)[collection]
    if (!all) throw new Error(`404: ${path}`)

    if (collection === 'chartOfAccounts') return { accounts: all }

    if (collection === 'transactions') {
      const from = params?.['startDate']
      const to = params?.['endDate']
      const date = /^\d{4}-\d{2}-\d{2}$/
      if (typeof from !== 'string' || !date.test(from) || typeof to !== 'string' || !date.test(to))
        throw new Error('400: startDate and endDate (YYYY-MM-DD) are required')
      all = all.filter((r) => {
        const day = r.timestamp?.slice(0, 10)
        return day === undefined || (day >= from && day <= to)
      })
    }

    if (collection === options.stuck) {
      const after = params?.['after']
      return {
        items: [],
        pageInfo: {
          endCursor: after === undefined ? encodeCursor(collection, 0) : String(after),
          hasNextPage: true,
          total: null,
        },
      }
    }

    if (collection === 'journalEntries') {
      const size = sizeOf(params?.['limit'])
      const start =
        params?.['cursor'] === undefined ? 0 : decodeCursor(collection, params['cursor'])
      const page = all.slice(start, start + size)
      const end = start + page.length
      return {
        journalEntries: page,
        pageInfo: { nextCursor: end < all.length ? encodeCursor(collection, end) : null },
      }
    }

    const size = Math.min(sizeOf(params?.['count']), options.capAt ?? Infinity)
    const start = params?.['after'] === undefined ? 0 : decodeCursor(collection, params['after'])
    const page = all.slice(start, start + size)
    const end = start + page.length
    const hasNextPage = end < all.length
    return {
      items: page,
      pageInfo: {
        // The cursor of the last row served, present on the last page too:
        // only `hasNextPage` says whether there is another page.
        endCursor:
          options.brokenCursor && hasNextPage
            ? null
            : page.length > 0
              ? encodeCursor(collection, end)
              : null,
        hasNextPage,
        total: options.totalNull ? null : options.totalOf === 'page' ? page.length : all.length,
      },
      ...(collection === 'invoices' || collection === 'bills'
        ? { total: { amount: '0.00', currency: 'USD' } }
        : {}),
    }
  })
  return { calls }
}

type ListMethod =
  | 'listInvoices'
  | 'listBills'
  | 'listTransactions'
  | 'listJournals'
  | 'listContacts'
  | 'listAccounts'

async function list(method: ListMethod, params: QueryParams, c: Credentials = creds) {
  const fn = adapter[method] as (c: Credentials, p: QueryParams) => Promise<Array<{ id?: string }>>
  return fn.call(adapter, c, params)
}

/** Pages 1..`pages` at `limit`, exactly as the sync worker asks for them. */
async function walkLikeTheWorker(
  method: ListMethod,
  limit: number,
  pages: number,
  c: Credentials = creds,
) {
  const ids: string[] = []
  const sizes: number[] = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  const local: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const got = await list(method, params, c)
    ids.push(...got.map((r) => String(r.id)))
    sizes.push(got.length)
    const report = readUpstreamPage(params)
    hasMore.push(report?.hasMore)
    totals.push(report?.totalCount)
    local.push(report?.pagedLocally)
  }
  return { ids, sizes, hasMore, totals, local }
}

/** Pages 1..`pages` through the API path: parseListQuery → adapter → listPage. */
async function walkTheApi(method: ListMethod, limit: number, pages: number) {
  const ids: string[] = []
  const metas = []
  for (let page = 1; page <= pages; page++) {
    const params = parseListQuery({ page: String(page), limit: String(limit) }, routed)
    const envelope = listPage(await list(method, params), params, adapter.platform)
    ids.push(...envelope.data.map((r) => String(r.id)))
    metas.push(envelope.meta)
  }
  return { ids, metas }
}

const L = 4

/** Every date: GET /company/{id}/transactions requires a window and the unified API names none. */
const EVERY_DATE = { startDate: '1900-01-01', endDate: '9999-12-31' }

// ── count / after: invoices, bills, transactions ─────────────────────────────

describe.each([
  { method: 'listInvoices', collection: 'invoices', window: {} },
  { method: 'listBills', collection: 'bills', window: {} },
  { method: 'listTransactions', collection: 'transactions', window: EVERY_DATE },
] as const)('Puzzle $method pages by count and after', ({ method, collection, window }) => {
  it('serves N = 2L + 1 rows once each over pages 1, 2, 3, with hasMore from pageInfo.hasNextPage', async () => {
    const all = rows(collection, 2 * L + 1)
    fakePuzzle({ [collection]: all })

    const walk = await walkLikeTheWorker(method, L, 3)

    expect(walk.ids).toEqual(all.map((r) => r.id))
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    expect(walk.totals).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
    // One upstream page is one caller page: nothing is cut locally, so the
    // paging-contract gate must measure these requests, not take them on trust.
    expect(walk.local).toEqual([undefined, undefined, undefined])
  })

  it('sends count and after, never limit, and page 2 carries page 1 endCursor as after', async () => {
    const upstream = fakePuzzle({ [collection]: rows(collection, 2 * L + 1) })

    await walkLikeTheWorker(method, L, 2)

    expect(upstream.calls.map((c) => c.params)).toEqual([
      { ...window, count: L },
      { ...window, count: L, after: encodeCursor(collection, L) },
    ])
    expect(upstream.calls.every((c) => c.collection === collection)).toBe(true)
  })

  it('keeps walks at two page sizes apart: page 2 at L + 1 after a walk at L is rows L + 2 .. 2L + 2', async () => {
    const all = rows(collection, 3 * L)
    fakePuzzle({ [collection]: all })

    await walkLikeTheWorker(method, L, 2)
    const got = await list(method, withPageSink({ page: 2, limit: L + 1 }))

    // A cursor minted at count L is a different position at count L + 1.
    expect(got.map((r) => r.id)).toEqual(all.slice(L + 1, 2 * L + 2).map((r) => r.id))
  })

  it('on the API path, a page Puzzle cuts short of count never ends the walk early', async () => {
    // 9 rows served 3 at a time whatever `count` asks: no cap is documented,
    // and none may turn a hasNextPage: true into meta.hasMore: false.
    const all = rows(collection, 9)
    fakePuzzle({ [collection]: all }, { capAt: 3 })

    const api = await walkTheApi(method, 20, 3)

    expect(api.ids).toEqual(all.map((r) => r.id))
    expect(api.metas.map((m) => m.hasMore)).toEqual([true, true, false])
  })

  it('on the API path, a pageInfo.total that is not the collection size never ends the walk early', async () => {
    const all = rows(collection, 2 * L + 1)
    fakePuzzle({ [collection]: all }, { totalOf: 'page' })

    const api = await walkTheApi(method, L, 3)

    expect(api.ids).toEqual(all.map((r) => r.id))
    expect(api.metas.map((m) => m.hasMore)).toEqual([true, true, false])
    // A total that disagrees with the rows served is not published at all.
    expect(api.metas.map((m) => m.totalCount)).toEqual([null, null, null])
  })

  it('ends exactly on N = 2L: a full page 2 reports hasMore false, not a guess', async () => {
    const all = rows(collection, 2 * L)
    fakePuzzle({ [collection]: all })

    const walk = await walkLikeTheWorker(method, L, 2)

    expect(walk.ids).toEqual(all.map((r) => r.id))
    expect(walk.hasMore).toEqual([true, false])
  })

  it('sends a limit above 100 as is: no maximum is documented, so nothing is clamped', async () => {
    const all = rows(collection, 150)
    const upstream = fakePuzzle({ [collection]: all })

    const walk = await walkLikeTheWorker(method, 150, 1)

    expect(upstream.calls[0]!.params).toEqual({ ...window, count: 150 })
    expect(walk.ids).toEqual(all.map((r) => r.id))
    expect(walk.hasMore).toEqual([false])
  })

  it('serves page 2 from params parseListQuery delivers, walking page 1 first on a cold pager', async () => {
    const all = rows(collection, 2 * L + 1)
    const upstream = fakePuzzle({ [collection]: all })

    const params = parseListQuery({ page: '2', limit: String(L) }, routed)
    const got = await list(method, params)

    expect(got.map((r) => r.id)).toEqual(all.slice(L, 2 * L).map((r) => r.id))
    expect(upstream.calls.map((c) => c.params)).toEqual([
      { ...window, count: L },
      { ...window, count: L, after: encodeCursor(collection, L) },
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('reports no totalCount when pageInfo.total is null, and hasMore still ends the walk', async () => {
    const all = rows(collection, 2 * L + 1)
    fakePuzzle({ [collection]: all }, { totalNull: true })

    const walk = await walkLikeTheWorker(method, L, 3)

    expect(walk.ids).toEqual(all.map((r) => r.id))
    expect(walk.hasMore).toEqual([true, true, false])
    expect(walk.totals).toEqual([undefined, undefined, undefined])
  })

  it('refuses a page that says hasNextPage with no endCursor, rather than ending the collection there', async () => {
    fakePuzzle({ [collection]: rows(collection, 2 * L + 1) }, { brokenCursor: true })

    await expect(list(method, withPageSink({ page: 1, limit: L }))).rejects.toThrow(/endCursor/)
  })

  it('does not hand one connection the walk of another connection to the same company', async () => {
    const upstream = fakePuzzle({ [collection]: rows(collection, 2 * L + 1) })
    const other = { accessToken: 'at-B', refreshToken: 'rt-B', tenantId: COMPANY } as Credentials

    await walkLikeTheWorker(method, L, 2)
    upstream.calls.length = 0
    await list(method, withPageSink({ page: 2, limit: L }), other)

    // B has no page-1 cursor of its own yet, so it must fetch page 1 itself.
    expect(upstream.calls.map((c) => [c.token, c.params])).toEqual([
      ['at-B', { ...window, count: L }],
      ['at-B', { ...window, count: L, after: encodeCursor(collection, L) }],
    ])
  })

  it('on the API path, parseListQuery → adapter → listPage reports meta.hasMore and the total', async () => {
    const all = rows(collection, 2 * L + 1)
    fakePuzzle({ [collection]: all })

    const api = await walkTheApi(method, L, 3)

    expect(api.ids).toEqual(all.map((r) => r.id))
    expect(api.metas.map((m) => m.hasMore)).toEqual([true, true, false])
    expect(api.metas.map((m) => m.totalCount)).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
  })

  it('on the API path, a full last page is hasMore false, not null', async () => {
    fakePuzzle({ [collection]: rows(collection, 2 * L) }, { totalNull: true })

    const api = await walkTheApi(method, L, 2)

    expect(api.metas.map((m) => m.hasMore)).toEqual([true, false])
  })
})

// ── limit / cursor: journal entries ──────────────────────────────────────────

describe('Puzzle listJournals pages by limit and cursor', () => {
  it('serves N = 2L + 1 rows once each over pages 1, 2, 3, with hasMore from pageInfo.nextCursor', async () => {
    const all = rows('je', 2 * L + 1)
    fakePuzzle({ journalEntries: all })

    const walk = await walkLikeTheWorker('listJournals', L, 3)

    expect(walk.ids).toEqual(all.map((r) => r.id))
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    // The endpoint reports no total.
    expect(walk.totals).toEqual([undefined, undefined, undefined])
    // One upstream page is one caller page: nothing is cut locally.
    expect(walk.local).toEqual([undefined, undefined, undefined])
  })

  it('sends limit and cursor, and page 2 carries page 1 nextCursor as cursor', async () => {
    const upstream = fakePuzzle({ journalEntries: rows('je', 2 * L + 1) })

    await walkLikeTheWorker('listJournals', L, 2)

    expect(upstream.calls.map((c) => c.params)).toEqual([
      { limit: L },
      { limit: L, cursor: encodeCursor('journalEntries', L) },
    ])
  })

  it('keeps walks at two page sizes apart: page 2 at L + 1 after a walk at L is rows L + 2 .. 2L + 2', async () => {
    const all = rows('je', 3 * L)
    fakePuzzle({ journalEntries: all })

    await walkLikeTheWorker('listJournals', L, 2)
    const got = await list('listJournals', withPageSink({ page: 2, limit: L + 1 }))

    expect(got.map((r) => r.id)).toEqual(all.slice(L + 1, 2 * L + 2).map((r) => r.id))
  })

  it('ends exactly on N = 2L: nextCursor null on a full page 2 is hasMore false', async () => {
    const all = rows('je', 2 * L)
    fakePuzzle({ journalEntries: all })

    const walk = await walkLikeTheWorker('listJournals', L, 2)

    expect(walk.ids).toEqual(all.map((r) => r.id))
    expect(walk.hasMore).toEqual([true, false])
  })

  it('sends a limit above 100 as is: no maximum is documented, so nothing is clamped', async () => {
    const all = rows('je', 150)
    const upstream = fakePuzzle({ journalEntries: all })

    const walk = await walkLikeTheWorker('listJournals', 150, 1)

    expect(upstream.calls[0]!.params).toEqual({ limit: 150 })
    expect(walk.ids).toEqual(all.map((r) => r.id))
    expect(walk.hasMore).toEqual([false])
  })

  it('serves page 2 from params parseListQuery delivers', async () => {
    const all = rows('je', 2 * L + 1)
    fakePuzzle({ journalEntries: all })

    const params = parseListQuery({ page: '2', limit: String(L) }, routed)
    const got = await list('listJournals', params)

    expect(got.map((r) => r.id)).toEqual(all.slice(L, 2 * L).map((r) => r.id))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('does not hand one connection the walk of another connection to the same company', async () => {
    const upstream = fakePuzzle({ journalEntries: rows('je', 2 * L + 1) })
    const other = { accessToken: 'at-B', refreshToken: 'rt-B', tenantId: COMPANY } as Credentials

    await walkLikeTheWorker('listJournals', L, 2)
    upstream.calls.length = 0
    await list('listJournals', withPageSink({ page: 2, limit: L }), other)

    expect(upstream.calls.map((c) => [c.token, c.params])).toEqual([
      ['at-B', { limit: L }],
      ['at-B', { limit: L, cursor: encodeCursor('journalEntries', L) }],
    ])
  })

  it('on the API path, parseListQuery → adapter → listPage reports meta.hasMore', async () => {
    const all = rows('je', 2 * L + 1)
    fakePuzzle({ journalEntries: all })

    const api = await walkTheApi('listJournals', L, 3)

    expect(api.ids).toEqual(all.map((r) => r.id))
    expect(api.metas.map((m) => m.hasMore)).toEqual([true, true, false])
    expect(api.metas.map((m) => m.totalCount)).toEqual([null, null, null])
  })
})

// ── one walk per collection ──────────────────────────────────────────────────

describe('Puzzle keeps each collection to its own walk on one connection', () => {
  it('serves page 3 of bills, transactions and journals cold after a walk of invoices', async () => {
    const data = {
      invoices: rows('invoices', 3 * L),
      bills: rows('bills', 3 * L),
      transactions: rows('transactions', 3 * L),
      journalEntries: rows('je', 3 * L),
    }
    fakePuzzle(data)

    await walkLikeTheWorker('listInvoices', L, 3)

    // The fake refuses a cursor minted for another collection, so a shared
    // walk would send invoices' page-3 cursor to the next endpoint.
    for (const [method, collection] of [
      ['listBills', 'bills'],
      ['listTransactions', 'transactions'],
      ['listJournals', 'journalEntries'],
    ] as const) {
      const got = await list(method, withPageSink({ page: 3, limit: L }))
      expect(got.map((r) => r.id)).toEqual(data[collection].slice(2 * L).map((r) => r.id))
    }
  })
})

// ── the date window transactions require ─────────────────────────────────────

describe('Puzzle listTransactions sends the date window Puzzle requires', () => {
  it('sends startDate and endDate on every page, and serves a transaction of any date', async () => {
    const all = ['1901-03-04', '1999-12-31', '2026-09-23', '2150-01-01', '9999-12-30'].map(
      (day, i) => ({ id: `txn-${i + 1}`, timestamp: `${day}T12:00:00.000Z` }),
    )
    const upstream = fakePuzzle({ transactions: all })

    const walk = await walkLikeTheWorker('listTransactions', 2, 3)

    expect(walk.ids).toEqual(all.map((r) => r.id))
    expect(walk.hasMore).toEqual([true, true, false])
    expect(upstream.calls.map((c) => c.params)).toEqual([
      { ...EVERY_DATE, count: 2 },
      { ...EVERY_DATE, count: 2, after: encodeCursor('transactions', 2) },
      { ...EVERY_DATE, count: 2, after: encodeCursor('transactions', 4) },
    ])
  })
})

// ── customers then vendors: contacts ─────────────────────────────────────────

describe('Puzzle listContacts pages one stream of customers then vendors', () => {
  it('serves N = 2L + 1 rows once each over pages 1, 2, 3, never more than L to a page', async () => {
    const customers = rows('cus', 5)
    const vendors = rows('ven', 4)
    fakePuzzle({ customers, vendors })

    const walk = await walkLikeTheWorker('listContacts', L, 3)

    expect(walk.ids).toEqual([...customers, ...vendors].map((r) => r.id))
    expect(walk.sizes).toEqual([L, L, 1])
    expect(walk.hasMore).toEqual([true, true, false])
    expect(walk.local).toEqual([true, true, true])
  })

  it('sends count and after to each endpoint, and page 2 carries the vendors endCursor as after', async () => {
    const customers = rows('cus', 3)
    const vendors = rows('ven', 6)
    const upstream = fakePuzzle({ customers, vendors })

    const walk = await walkLikeTheWorker('listContacts', L, 1)
    expect(upstream.calls.map((c) => [c.collection, c.params])).toEqual([
      ['customers', { count: L }],
      ['vendors', { count: L }],
    ])
    upstream.calls.length = 0

    const params = withPageSink({ page: 2, limit: L })
    const page2 = await list('listContacts', params)

    expect(upstream.calls.map((c) => [c.collection, c.params])).toEqual([
      ['vendors', { count: L, after: encodeCursor('vendors', L) }],
    ])
    expect([...walk.ids, ...page2.map((r) => String(r.id))]).toEqual(
      [...customers, ...vendors].slice(0, 2 * L).map((r) => r.id),
    )
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('follows the customers cursor before moving on to vendors', async () => {
    const customers = rows('cus', 6)
    const vendors = rows('ven', 3)
    const upstream = fakePuzzle({ customers, vendors })

    const walk = await walkLikeTheWorker('listContacts', L, 3)

    expect(walk.ids).toEqual([...customers, ...vendors].map((r) => r.id))
    expect(walk.hasMore).toEqual([true, true, false])
    expect(upstream.calls.map((c) => [c.collection, c.params])).toEqual([
      ['customers', { count: L }],
      // Page 1 ended on an upstream boundary: this peek decides hasMore.
      ['customers', { count: L, after: encodeCursor('customers', L) }],
      ['vendors', { count: L }],
    ])
  })

  it('ends exactly on N = 2L: a full page 2 reports hasMore false', async () => {
    const customers = rows('cus', 4)
    const vendors = rows('ven', 4)
    fakePuzzle({ customers, vendors })

    const walk = await walkLikeTheWorker('listContacts', L, 2)

    expect(walk.ids).toEqual([...customers, ...vendors].map((r) => r.id))
    expect(walk.hasMore).toEqual([true, false])
  })

  it('serves vendors alone when there are no customers, and customers alone when there are no vendors', async () => {
    const vendors = rows('ven', 2 * L + 1)
    fakePuzzle({ customers: [], vendors })
    const onlyVendors = await walkLikeTheWorker('listContacts', L, 3)
    expect(onlyVendors.ids).toEqual(vendors.map((r) => r.id))
    expect(onlyVendors.hasMore).toEqual([true, true, false])

    vi.restoreAllMocks()
    _resetCursorPager()
    const customers = rows('cus', 2 * L + 1)
    fakePuzzle({ customers, vendors: [] })
    const onlyCustomers = await walkLikeTheWorker('listContacts', L, 3)
    expect(onlyCustomers.ids).toEqual(customers.map((r) => r.id))
    expect(onlyCustomers.hasMore).toEqual([true, true, false])
  })

  it('sends a limit above 100 as is to both endpoints: nothing is clamped', async () => {
    const customers = rows('cus', 150)
    const vendors = rows('ven', 120)
    const upstream = fakePuzzle({ customers, vendors })

    const walk = await walkLikeTheWorker('listContacts', 300, 1)

    expect(upstream.calls.map((c) => [c.collection, c.params])).toEqual([
      ['customers', { count: 300 }],
      ['vendors', { count: 300 }],
    ])
    expect(walk.ids).toEqual([...customers, ...vendors].map((r) => r.id))
    expect(walk.hasMore).toEqual([false])
  })

  it('serves page 2 from params parseListQuery delivers, on a cold pager', async () => {
    const customers = rows('cus', 5)
    const vendors = rows('ven', 4)
    fakePuzzle({ customers, vendors })

    const params = parseListQuery({ page: '2', limit: String(L) }, routed)
    const got = await list('listContacts', params)

    expect(got.map((r) => r.id)).toEqual(
      [...customers, ...vendors].slice(L, 2 * L).map((r) => r.id),
    )
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('never serves one connection rows fetched with another connection token', async () => {
    const seenBy = (token: string): Dataset => ({
      customers: rows(`${token}-cus`, 5),
      vendors: rows(`${token}-ven`, 4),
    })
    const upstream = fakePuzzle(seenBy)
    const other = { accessToken: 'at-B', refreshToken: 'rt-B', tenantId: COMPANY } as Credentials

    await walkLikeTheWorker('listContacts', L, 1)
    const page2 = await list('listContacts', withPageSink({ page: 2, limit: L }), other)

    const b = seenBy('at-B')
    expect(page2.map((r) => r.id)).toEqual(
      [...b.customers!, ...b.vendors!].slice(L, 2 * L).map((r) => r.id),
    )
    expect(upstream.calls.filter((c) => c.token === 'at-B').length).toBeGreaterThan(0)
  })

  it('refuses a customers page that says hasNextPage with no endCursor, rather than moving on to vendors', async () => {
    // Moving on would never serve customers 5..9, and end the stream as complete.
    fakePuzzle(
      { customers: rows('cus', 2 * L + 1), vendors: rows('ven', 3) },
      { brokenCursor: true },
    )

    await expect(list('listContacts', withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /customers reported hasNextPage with no endCursor/,
    )
  })

  it('refuses a vendors page that says hasNextPage with no endCursor, on a page straddling the two', async () => {
    // Customers end inside page 1 (hasNextPage false), so page 1 goes on into vendors.
    fakePuzzle(
      { customers: rows('cus', 2), vendors: rows('ven', 2 * L + 1) },
      { brokenCursor: true },
    )

    await expect(list('listContacts', withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /vendors reported hasNextPage with no endCursor/,
    )
  })

  it('stops at once on a page whose endCursor is the after it was sent, instead of walking the budget', async () => {
    const upstream = fakePuzzle({ customers: [], vendors: rows('ven', 3) }, { stuck: 'vendors' })

    await expect(list('listContacts', withPageSink({ page: 1, limit: L }))).rejects.toThrow(
      /names itself as the next page/,
    )
    // customers, the first vendors page, and the vendors page that repeats its own cursor.
    expect(upstream.calls.map((c) => c.collection)).toEqual(['customers', 'vendors', 'vendors'])
  })

  it('on the API path, parseListQuery → adapter → listPage reports meta.hasMore', async () => {
    const customers = rows('cus', 5)
    const vendors = rows('ven', 4)
    fakePuzzle({ customers, vendors })

    const api = await walkTheApi('listContacts', L, 3)

    expect(api.ids).toEqual([...customers, ...vendors].map((r) => r.id))
    expect(api.metas.map((m) => m.hasMore)).toEqual([true, true, false])
  })
})

// ── the whole chart: accounts ────────────────────────────────────────────────

describe('Puzzle listAccounts slices the whole chart of accounts', () => {
  it('serves N = 2L + 1 accounts once each over pages 1, 2, 3, with the total', async () => {
    const all = rows('acct', 2 * L + 1)
    const upstream = fakePuzzle({ chartOfAccounts: all })

    const walk = await walkLikeTheWorker('listAccounts', L, 3)

    expect(walk.ids).toEqual(all.map((r) => r.id))
    expect(walk.hasMore).toEqual([true, true, false])
    expect(walk.totals).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
    expect(walk.local).toEqual([true, true, true])
    // The endpoint documents no paging parameter, so none is sent.
    expect(upstream.calls.map((c) => [c.collection, c.params])).toEqual([
      ['chartOfAccounts', undefined],
      ['chartOfAccounts', undefined],
      ['chartOfAccounts', undefined],
    ])
  })

  it('ends exactly on N = 2L', async () => {
    const all = rows('acct', 2 * L)
    fakePuzzle({ chartOfAccounts: all })

    const walk = await walkLikeTheWorker('listAccounts', L, 2)

    expect(walk.ids).toEqual(all.map((r) => r.id))
    expect(walk.hasMore).toEqual([true, false])
  })

  it('serves every account at a limit above the chart size', async () => {
    const all = rows('acct', 150)
    fakePuzzle({ chartOfAccounts: all })

    const walk = await walkLikeTheWorker('listAccounts', 500, 1)

    expect(walk.ids).toEqual(all.map((r) => r.id))
    expect(walk.hasMore).toEqual([false])
  })

  it('on the API path, parseListQuery → adapter → listPage reports meta.hasMore and the total', async () => {
    const all = rows('acct', 2 * L + 1)
    fakePuzzle({ chartOfAccounts: all })

    const api = await walkTheApi('listAccounts', L, 3)

    expect(api.ids).toEqual(all.map((r) => r.id))
    expect(api.metas.map((m) => m.hasMore)).toEqual([true, true, false])
    expect(api.metas.map((m) => m.totalCount)).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
  })
})

// ── the page size itself, on a direct call ───────────────────────────────────

describe.each([
  { method: 'listInvoices', collection: 'invoices', size: 'count' },
  { method: 'listBills', collection: 'bills', size: 'count' },
  { method: 'listTransactions', collection: 'transactions', size: 'count' },
  { method: 'listJournals', collection: 'journalEntries', size: 'limit' },
  { method: 'listContacts', collection: 'customers', size: 'count' },
] as const)('Puzzle $method page size on a direct call', ({ method, collection, size }) => {
  // parseListQuery and the worker always send a whole limit of 1 to 500, so
  // only a direct call reaches these.
  const data = (n: number): Dataset =>
    collection === 'customers'
      ? { customers: rows('cus', n), vendors: [] }
      : { [collection]: rows(collection, n) }

  it('asks for and serves the default 50 rows when no limit is named', async () => {
    const upstream = fakePuzzle(data(60))

    const got = await list(method, withPageSink({ page: 1 }))

    expect(got).toHaveLength(50)
    expect(upstream.calls[0]!.params?.[size]).toBe(50)
  })

  it('asks for and serves the whole number below a fractional limit', async () => {
    const upstream = fakePuzzle(data(3 * L))

    const got = await list(method, withPageSink({ page: 1, limit: L + 0.5 }))

    expect(got).toHaveLength(L)
    expect(upstream.calls[0]!.params?.[size]).toBe(L)
  })

  it.each([0, -1, Number.NaN])(
    'refuses limit %s without a request, as the row pager does, rather than guessing a size',
    async (limit) => {
      const upstream = fakePuzzle(data(3 * L))

      await expect(list(method, withPageSink({ page: 1, limit }))).rejects.toThrow(RangeError)
      expect(upstream.calls).toEqual([])
    },
  )
})
