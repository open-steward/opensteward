/**
 * Square list paging: 1-based `page` + caller's `limit` → each list
 * endpoint's documented `cursor` chain.
 *
 * Every Square list endpoint pages by an opaque cursor: "The pagination
 * cursor to be used in a subsequent request. If empty, this is the final
 * response." Sizes, per endpoint reference page:
 *
 *   GET  /v2/payments, /v2/refunds, /v2/payouts   `limit`, max 100 (over-max
 *        ignored / capped). One upstream page is one caller page (pageByCursor).
 *   GET  /v2/invoices                             `limit`, max 200 (pageByCursor).
 *   GET  /v2/customers                            `limit` 1..100, over-max is a
 *        hard 400 VALUE_TOO_HIGH, and "This limit is advisory" (pageByRows).
 *   GET  /v2/cards                                no size; "A max of 25 cards
 *        will be returned." (pageByRows).
 *   GET  /v2/disputes                             no size, none documented (pageByRows).
 *   POST /v2/catalog/search                       body `cursor` + `limit` (max
 *        1,000, advisory) (pageByRows).
 *   GET  /v2/payouts → /v2/payouts/{id}/payout-entries   entries flattened
 *        across the payouts walk, each cursor-paged (pageByRows).
 *
 * The fake below honours ONLY those parameters.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type PageMaxBearing,
  type QueryParams,
} from '@opensteward/shared'
import { SquareAdapter } from '../../../../../../src/verticals/payments/adapters/square/index'

const CREDS: Credentials = {
  accessToken: 'sq_access',
  refreshToken: 'sq_refresh',
  extra: { merchantId: 'M1' },
}

type Method =
  | 'listCharges'
  | 'listRefunds'
  | 'listCustomers'
  | 'listPaymentMethods'
  | 'listInvoices'
  | 'listPayouts'
  | 'listDisputes'
  | 'listPlans'
  | 'listBalanceTransactions'

interface Sent {
  verb: 'get' | 'post'
  path: string
  args: Record<string, unknown>
  token: string
}

interface Case {
  method: Method
  /** The list request's path. */
  path: string
  prefix: string
  /** Largest `limit` the endpoint takes, or null when it takes none. */
  cap: number | null
}

const CASES: Case[] = [
  { method: 'listCharges', path: '/payments', prefix: 'pay', cap: 100 },
  { method: 'listRefunds', path: '/refunds', prefix: 'ref', cap: 100 },
  { method: 'listCustomers', path: '/customers', prefix: 'cus', cap: 100 },
  { method: 'listPaymentMethods', path: '/cards', prefix: 'card', cap: null },
  { method: 'listInvoices', path: '/invoices', prefix: 'inv', cap: 200 },
  { method: 'listPayouts', path: '/payouts', prefix: 'po', cap: 100 },
  { method: 'listDisputes', path: '/disputes', prefix: 'dp', cap: null },
  { method: 'listPlans', path: '/catalog/search', prefix: 'plan', cap: 1000 },
  { method: 'listBalanceTransactions', path: '/payout-entries', prefix: 'pe', cap: 100 },
]

/** Cards: "A max of 25 cards will be returned." */
const CARDS_PER_PAGE = 25
/** Disputes: no size parameter; the platform picks one. */
const DISPUTES_PER_PAGE = 10

function makeIds(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(4, '0')}`)
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

function row(id: string): Record<string, unknown> {
  return {
    id,
    dispute_id: id,
    amount_money: { amount: 100, currency: 'USD' },
    type: 'SUBSCRIPTION_PLAN',
  }
}

interface FakeOptions {
  /** Entries per payout for balance transactions (default: everything on one payout). */
  entriesPerPayout?: number[]
  /** Payouts in the balance-transaction parent walk that hold no entries, appended. */
  emptyPayouts?: number
  /** Customers: return this many rows more than the limit asked ("advisory"). */
  customersOverdeliver?: number
  /** Id prefix per access token, so two connections hold different rows. */
  prefixByToken?: Record<string, string>
  /** End every chain with `cursor: ''` instead of omitting it ("If empty, this is the final response"). */
  emptyFinalCursor?: boolean
  /** Balance transactions: this many payouts WITHOUT an id listed before the real ones. */
  idlessPayouts?: number
}

/**
 * A fake Square holding `n` rows per collection, reading ONLY each
 * endpoint's documented parameters. Cursors are opaque strings bound to their
 * collection; a cursor from another collection is a 400.
 */
function fakeSquare(n: number, opts: FakeOptions = {}) {
  const sent: Sent[] = []
  const cursorOf = (tag: string, offset: number) => `c:${tag}:${offset}`
  const offsetOf = (tag: string, cursor: unknown): number => {
    if (cursor === undefined) return 0
    const m = /^c:(.+):(\d+)$/.exec(String(cursor))
    if (!m || m[1] !== tag) throw badRequest(`cursor ${String(cursor)} for ${tag}`)
    return Number(m[2])
  }
  const slice = (tag: string, ids: string[], cursor: unknown, size: number) => {
    const offset = offsetOf(tag, cursor)
    const rows = ids.slice(offset, offset + size).map(row)
    const end = offset + size
    const last = opts.emptyFinalCursor ? '' : undefined
    return { rows, cursor: end < ids.length ? cursorOf(tag, end) : last }
  }
  /** "greater than 100, it is ignored and the default value is used instead." */
  const ignoredOverMax = (raw: unknown, max: number, dflt: number): number => {
    const v = raw === undefined ? dflt : Number(raw)
    return !Number.isInteger(v) || v < 1 || v > max ? dflt : v
  }

  const ids = (prefix: string, token: string) => makeIds(opts.prefixByToken?.[token] ?? prefix, n)

  // Balance transactions: payouts, each with its own entries.
  const perPayout = opts.entriesPerPayout ?? [n]
  const payoutEntries: string[][] = []
  {
    const all = makeIds('pe', n)
    let at = 0
    for (const k of perPayout) {
      payoutEntries.push(all.slice(at, at + k))
      at += k
    }
    for (let i = 0; i < (opts.emptyPayouts ?? 0); i++) payoutEntries.push([])
  }
  const payoutIds = (bt: boolean, token: string) =>
    bt ? payoutEntries.map((_, i) => `bpo_${String(i + 1).padStart(4, '0')}`) : ids('po', token)

  const makeGet = (token: string) =>
    vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
      const q = { ...(config?.params ?? {}) }
      for (const k of Object.keys(q)) if (q[k] === undefined) delete q[k]
      sent.push({ verb: 'get', path, args: q, token })
      switch (path) {
        case '/payments': {
          const r = slice('pay', ids('pay', token), q.cursor, ignoredOverMax(q.limit, 100, 100))
          return {
            data: { payments: r.rows, ...(r.cursor !== undefined ? { cursor: r.cursor } : {}) },
          }
        }
        case '/refunds': {
          // "If the supplied value is greater than 100, no more than 100 results are returned."
          const asked = q.limit === undefined ? 100 : Number(q.limit)
          const r = slice('ref', ids('ref', token), q.cursor, Math.min(asked, 100))
          return {
            data: { refunds: r.rows, ...(r.cursor !== undefined ? { cursor: r.cursor } : {}) },
          }
        }
        case '/customers': {
          const size = q.limit === undefined ? 100 : Number(q.limit)
          if (!Number.isInteger(size) || size < 1) throw badRequest('VALUE_TOO_LOW')
          if (size > 100) throw badRequest('VALUE_TOO_HIGH')
          const r = slice(
            'cus',
            ids('cus', token),
            q.cursor,
            size + (opts.customersOverdeliver ?? 0),
          )
          return {
            data: { customers: r.rows, ...(r.cursor !== undefined ? { cursor: r.cursor } : {}) },
          }
        }
        case '/cards': {
          if ('limit' in q) throw badRequest('limit is not a ListCards parameter')
          let all = ids('card', token)
          if (q.customer_id !== undefined) all = all.filter((_, i) => i % 2 === 0)
          const tag = `card${String(q.customer_id ?? '')}`
          const r = slice(tag, all, q.cursor, CARDS_PER_PAGE)
          return {
            data: { cards: r.rows, ...(r.cursor !== undefined ? { cursor: r.cursor } : {}) },
          }
        }
        case '/invoices': {
          const size = q.limit === undefined ? 100 : Number(q.limit)
          if (!Number.isInteger(size) || size < 1 || size > 200) throw badRequest('limit')
          // location_id: the even rows live at L_EVEN, the odd rows at L_ODD.
          let all = ids('inv', token)
          if (q.location_id === 'L_EVEN') all = all.filter((_, i) => i % 2 === 0)
          else if (q.location_id === 'L_ODD') all = all.filter((_, i) => i % 2 === 1)
          const r = slice(`inv${String(q.location_id ?? '')}`, all, q.cursor, size)
          return {
            data: { invoices: r.rows, ...(r.cursor !== undefined ? { cursor: r.cursor } : {}) },
          }
        }
        case '/payouts': {
          const bt = opts.entriesPerPayout !== undefined || opts.emptyPayouts !== undefined
          const all = [...Array<string>(opts.idlessPayouts ?? 0).fill(''), ...payoutIds(bt, token)]
          const r = slice('po', all, q.cursor, ignoredOverMax(q.limit, 100, 100))
          const payouts = r.rows.map((p) => (p.id === '' ? { status: 'PAID' } : p))
          return { data: { payouts, ...(r.cursor !== undefined ? { cursor: r.cursor } : {}) } }
        }
        case '/disputes': {
          if ('limit' in q) throw badRequest('limit is not a ListDisputes parameter')
          const r = slice('dp', ids('dp', token), q.cursor, DISPUTES_PER_PAGE)
          return {
            data: { disputes: r.rows, ...(r.cursor !== undefined ? { cursor: r.cursor } : {}) },
          }
        }
      }
      const m = /^\/payouts\/(bpo_\d+)\/payout-entries$/.exec(path)
      if (m) {
        const i = Number(m[1]!.slice(4)) - 1
        const entries = payoutEntries[i]
        if (!entries) throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
        const r = slice(`pe${m[1]}`, entries, q.cursor, ignoredOverMax(q.limit, 100, 100))
        return {
          data: {
            payout_entries: r.rows.map((e) => ({ ...e, payout_id: m[1] })),
            ...(r.cursor !== undefined ? { cursor: r.cursor } : {}),
          },
        }
      }
      throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    })

  const makePost = (token: string) =>
    vi.fn(async (path: string, body?: Record<string, unknown>) => {
      const b = { ...(body ?? {}) }
      sent.push({ verb: 'post', path, args: b, token })
      if (path !== '/catalog/search')
        throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
      // "negative, zero, or is higher than the maximum limit of 1,000, it will be ignored."
      const size = ignoredOverMax(b.limit, 1000, 100)
      const r = slice('plan', ids('plan', token), b.cursor, size)
      return { data: { objects: r.rows, ...(r.cursor !== undefined ? { cursor: r.cursor } : {}) } }
    })

  vi.spyOn(axios, 'create').mockImplementation(((config?: {
    headers?: Record<string, unknown>
  }) => {
    const token = String(config?.headers?.Authorization ?? '').replace(/^Bearer /, '')
    return { get: makeGet(token), post: makePost(token), delete: vi.fn() }
  }) as never)
  return { sent }
}

async function callPage(
  adapter: SquareAdapter,
  method: Method,
  page: number,
  limit: number,
  extra: QueryParams = {},
  creds: Credentials = CREDS,
) {
  const params = withPageSink({ ...extra, page, limit })
  const items = (await adapter[method](creds, params)) as Array<{ id: string }>
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, params }
}

/** Walk until hasMore is false (at most `max` pages). */
async function walkAll(adapter: SquareAdapter, method: Method, limit: number, max = 30) {
  const pages = []
  for (let k = 1; k <= max; k++) {
    const p = await callPage(adapter, method, k, limit)
    pages.push(p)
    if (p.hasMore === false) break
  }
  return pages
}

/** The request path a case's list request goes to. */
function isListRequest(c: Case, s: Sent): boolean {
  return c.path === '/payout-entries' ? s.path.endsWith('/payout-entries') : s.path === c.path
}

function btOpts(n: number): FakeOptions {
  // Two entries, an empty payout, then the rest on a third payout.
  return { entriesPerPayout: [Math.min(2, n), 0, Math.max(n - 2, 0)] }
}

function fakeFor(c: Case, n: number) {
  return fakeSquare(n, c.method === 'listBalanceTransactions' ? btOpts(n) : {})
}

beforeEach(() => {
  _resetCursorPager()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(CASES)('Square $method paging', (c) => {
  it('serves 2L+1 rows over three pages, each id once, in order, with exact hasMore', async () => {
    const L = 3
    fakeFor(c, 2 * L + 1)
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const p1 = await callPage(adapter, c.method, 1, L)
    const p2 = await callPage(adapter, c.method, 2, L)
    const p3 = await callPage(adapter, c.method, 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(makeIds(c.prefix, 2 * L + 1))
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    const p4 = await callPage(adapter, c.method, 4, L)
    expect(p4.ids).toEqual([])
    expect(p4.hasMore).toBe(false)
  })

  it('clamps a limit above the maximum and still serves every row', async () => {
    const n = 2 * (c.cap ?? CARDS_PER_PAGE) + 1
    const { sent } = fakeFor(c, n)
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const pages = await walkAll(adapter, c.method, 5000)
    const all = pages.flatMap((p) => p.ids)
    expect(all).toEqual(makeIds(c.prefix, n))
    expect(pages[pages.length - 1]!.hasMore).toBe(false)
    const listed = sent.filter((s) => isListRequest(c, s))
    expect(listed.length).toBeGreaterThan(1)
    if (c.cap === null) expect(listed.every((s) => !('limit' in s.args))).toBe(true)
    else expect(listed.every((s) => Number(s.args.limit) <= c.cap!)).toBe(true)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    fakeFor(c, 5)
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as PageMaxBearing,
      )
      const items: unknown[] = await adapter[c.method](CREDS, params)
      return listPage(items, params, 'square')
    }
    const r1 = await run(1)
    expect(r1.data).toHaveLength(2)
    expect(r1.meta.hasMore).toBe(true)
    const r2 = await run(2)
    expect(r2.data).toHaveLength(2)
    expect(r2.meta.hasMore).toBe(true)
    const r3 = await run(3)
    expect(r3.data).toHaveLength(1)
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Square page-2 requests carry the documented cursor', () => {
  it.each(CASES.filter((c) => c.method !== 'listBalanceTransactions'))(
    '$method: requests after the first carry `cursor` from the previous response',
    async (c) => {
      const L = 60
      const { sent } = fakeFor(c, 250)
      const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
      await callPage(adapter, c.method, 1, L)
      expect(sent[0]!.args.cursor).toBeUndefined()
      const before = sent.length
      const p2 = await callPage(adapter, c.method, 2, L)
      expect(p2.ids).toEqual(makeIds(c.prefix, 250).slice(L, 2 * L))
      const later = sent.slice(1)
      expect(later.length).toBeGreaterThanOrEqual(1)
      expect(later.every((s) => typeof s.args.cursor === 'string')).toBe(true)
      expect(later.every((s) => s.path === c.path)).toBe(true)
      if (c.cap !== null && c.method !== 'listCustomers' && c.method !== 'listPlans') {
        // pageByCursor: page 2 is exactly one request, the cursor page 1 returned.
        expect(sent.length - before).toBe(1)
        expect(sent[before]!.args).toMatchObject({ limit: L, cursor: `c:${c.prefix}:${L}` })
      }
    },
  )

  it('listPlans sends cursor and limit in the POST body with object_types', async () => {
    const { sent } = fakeSquare(10)
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    await callPage(adapter, 'listPlans', 1, 4)
    await callPage(adapter, 'listPlans', 2, 4)
    expect(sent[0]).toMatchObject({
      verb: 'post',
      args: { object_types: ['SUBSCRIPTION_PLAN'], limit: 4 },
    })
    expect(sent[1]).toMatchObject({
      verb: 'post',
      args: { object_types: ['SUBSCRIPTION_PLAN'], limit: 4, cursor: 'c:plan:4' },
    })
  })

  it('listBalanceTransactions: page 2 follows the payout-entries cursor', async () => {
    const L = 100
    const { sent } = fakeSquare(250, { entriesPerPayout: [250] })
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const p1 = await callPage(adapter, 'listBalanceTransactions', 1, L)
    expect(sent.map((s) => [s.path, s.args])).toEqual([
      ['/payouts', { limit: 100 }],
      ['/payouts/bpo_0001/payout-entries', { limit: 100 }],
      ['/payouts/bpo_0001/payout-entries', { limit: 100, cursor: 'c:pebpo_0001:100' }],
    ])
    sent.length = 0
    const p2 = await callPage(adapter, 'listBalanceTransactions', 2, L)
    expect(sent.map((s) => [s.path, s.args])).toEqual([
      ['/payouts/bpo_0001/payout-entries', { limit: 100, cursor: 'c:pebpo_0001:200' }],
    ])
    const p3 = await callPage(adapter, 'listBalanceTransactions', 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(makeIds('pe', 250))
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
  })

  it('listBalanceTransactions: walks every payout, following the payouts cursor', async () => {
    // 101 payouts with one entry each, then 3 empty ones: two payouts pages.
    const n = 101
    const { sent } = fakeSquare(n, { entriesPerPayout: Array(n).fill(1), emptyPayouts: 3 })
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const pages = await walkAll(adapter, 'listBalanceTransactions', 40)
    expect(pages.flatMap((p) => p.ids)).toEqual(makeIds('pe', n))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    const payoutsRequests = sent.filter((s) => s.path === '/payouts')
    expect(payoutsRequests.map((s) => s.args)).toEqual([
      { limit: 100 },
      { limit: 100, cursor: 'c:po:100' },
    ])
  })
})

describe('Square paging details', () => {
  it('listCustomers: an advisory limit that returns more rows still serves each row once', async () => {
    const n = 250
    const { sent } = fakeSquare(n, { customersOverdeliver: 7 })
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const pages = await walkAll(adapter, 'listCustomers', 40)
    const all = pages.flatMap((p) => p.ids)
    expect(all).toEqual(makeIds('cus', n))
    expect(pages.every((p, i) => p.ids.length === (i < pages.length - 1 ? 40 : n % 40))).toBe(true)
    // Upstream pages of 107 rows each: the second request starts past them.
    expect(sent.map((s) => s.args)).toEqual([
      { limit: 100 },
      { limit: 100, cursor: 'c:cus:107' },
      { limit: 100, cursor: 'c:cus:214' },
    ])
  })

  it('listPaymentMethods keeps customer_id on every request of the walk', async () => {
    const { sent } = fakeSquare(80)
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const pages = []
    for (let k = 1; k <= 3; k++)
      pages.push(await callPage(adapter, 'listPaymentMethods', k, 20, { customer_id: 'C1' }))
    expect(pages.flatMap((p) => p.ids)).toEqual(makeIds('card', 80).filter((_, i) => i % 2 === 0))
    expect(pages.map((p) => p.hasMore)).toEqual([true, false, false])
    expect(sent.every((s) => s.args.customer_id === 'C1')).toBe(true)
  })

  it('reports the size sent when a cursor endpoint is asked for more than its maximum', async () => {
    fakeSquare(3)
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const p = await callPage(adapter, 'listCharges', 1, 500)
    expect(readUpstreamPage(p.params)?.pageSize).toBe(100)
    const inv = await callPage(adapter, 'listInvoices', 1, 500)
    expect(readUpstreamPage(inv.params)?.pageSize).toBe(200)
  })

  it('keeps each connection on its own walk (no rows cross connections)', async () => {
    const { sent } = fakeSquare(40, { prefixByToken: { tok_a: 'A', tok_b: 'B' } })
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const a = { accessToken: 'tok_a', refreshToken: 'ra', extra: { merchantId: 'M1' } }
    const b = { accessToken: 'tok_b', refreshToken: 'rb', extra: { merchantId: 'M1' } }
    // Disputes come 10 to an upstream page: A's page 1 of 5 leaves 5 in hand.
    await callPage(adapter, 'listDisputes', 1, 5, {}, a)
    sent.length = 0
    const b2 = await callPage(adapter, 'listDisputes', 2, 5, {}, b)
    expect(b2.ids).toEqual(makeIds('B', 40).slice(5, 10))
    expect(sent.length).toBeGreaterThanOrEqual(1)
    expect(sent.every((s) => s.token === 'tok_b')).toBe(true)
  })
})

describe('Square pager keys hold every input that shapes a walk', () => {
  it('listCharges: page 2 at a new limit is page 2 at that limit, not the old walk', async () => {
    const { sent } = fakeSquare(60)
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    await callPage(adapter, 'listCharges', 1, 10)
    sent.length = 0
    const p2 = await callPage(adapter, 'listCharges', 2, 20)
    expect(p2.ids).toEqual(makeIds('pay', 60).slice(20, 40))
    expect(sent.every((s) => s.args.limit === 20)).toBe(true)
  })

  it('listPlans: page 2 at a new limit is page 2 at that limit', async () => {
    fakeSquare(60)
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    await callPage(adapter, 'listPlans', 1, 10)
    const p2 = await callPage(adapter, 'listPlans', 2, 20)
    expect(p2.ids).toEqual(makeIds('plan', 60).slice(20, 40))
  })

  it('listInvoices: location_id is sent on every request and each location walks alone', async () => {
    const { sent } = fakeSquare(40)
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const all = makeIds('inv', 40)
    const even = all.filter((_, i) => i % 2 === 0)
    const odd = all.filter((_, i) => i % 2 === 1)
    const a1 = await callPage(adapter, 'listInvoices', 1, 5, { location_id: 'L_EVEN' })
    expect(a1.ids).toEqual(even.slice(0, 5))
    const b2 = await callPage(adapter, 'listInvoices', 2, 5, { location_id: 'L_ODD' })
    expect(b2.ids).toEqual(odd.slice(5, 10))
    const a2 = await callPage(adapter, 'listInvoices', 2, 5, { location: 'L_EVEN' })
    expect(a2.ids).toEqual(even.slice(5, 10))
    expect(
      sent.every((s) => s.args.location_id === 'L_EVEN' || s.args.location_id === 'L_ODD'),
    ).toBe(true)
  })

  it('listPaymentMethods: a customer walk and an unfiltered walk never share a cursor', async () => {
    const { sent } = fakeSquare(80)
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const c1 = await callPage(adapter, 'listPaymentMethods', 1, 10, { customer: 'C1' })
    expect(c1.ids).toEqual(
      makeIds('card', 80)
        .filter((_, i) => i % 2 === 0)
        .slice(0, 10),
    )
    expect(sent.every((s) => s.args.customer_id === 'C1')).toBe(true)
    sent.length = 0
    const u2 = await callPage(adapter, 'listPaymentMethods', 2, 10)
    expect(u2.ids).toEqual(makeIds('card', 80).slice(10, 20))
    expect(sent.every((s) => !('customer_id' in s.args))).toBe(true)
  })
})

describe('Square end of chain', () => {
  it.each(CASES)('$method: an empty-string cursor ends the walk', async (c) => {
    const n = 7
    const { sent } = fakeSquare(n, {
      ...(c.method === 'listBalanceTransactions' ? btOpts(n) : {}),
      emptyFinalCursor: true,
    })
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const pages = await walkAll(adapter, c.method, 3, 6)
    expect(pages.flatMap((p) => p.ids)).toEqual(makeIds(c.prefix, n))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(sent.some((s) => s.args.cursor === '')).toBe(false)
  })

  it('listBalanceTransactions: a payouts page with no usable ids walks on to the next page', async () => {
    const { sent } = fakeSquare(5, { entriesPerPayout: [5], idlessPayouts: 100 })
    const adapter = new SquareAdapter({ clientId: 'x', clientSecret: 'y', redirectUri: 'z' })
    const p1 = await callPage(adapter, 'listBalanceTransactions', 1, 10)
    expect(p1.ids).toEqual(makeIds('pe', 5))
    expect(p1.hasMore).toBe(false)
    expect(sent.filter((s) => s.path === '/payouts').map((s) => s.args)).toEqual([
      { limit: 100 },
      { limit: 100, cursor: 'c:po:100' },
    ])
  })
})
