/**
 * Hyperswitch list paging: 1-based `page` + caller's `limit` → each list
 * endpoint's documented position parameter.
 *
 *   GET  /payments/list   cursor only: `limit` (PageSize, 1..100) and
 *                         `ending_before` — "A cursor for use in pagination,
 *                         fetch the previous list before some object"
 *                         (https://api-reference.hyperswitch.io/v1/payments/payments--list).
 *                         Rows come newest first and the anchor comes back as
 *                         the first row (storage filters `created_at <=`), so
 *                         the adapter walks fixed 100-row pages with pageByRows.
 *   POST /refunds/list    body `limit` (1..100) + `offset`, `total_count`.
 *   GET  /customers/list  query `limit` + `offset` ("Offset for pagination"),
 *                         bare array.
 *   GET  /disputes/list   query `limit` (1..100) + `offset`, bare array.
 *   POST /payouts/list    body `limit` (1..20, PAYOUTS_LIST_MAX_LIMIT_POST) +
 *                         `offset`, `total_count`; walked in fixed 20-row pages
 *                         with pageByRows so the caller gets exactly `limit`.
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
import { HyperswitchAdapter } from '../../../../../../src/verticals/payments/adapters/hyperswitch/index'

const MAX = 100
const PAYOUTS_MAX = 20

const CREDS: Credentials = { accessToken: 'snd_test_key' }

type Method = 'listCharges' | 'listRefunds' | 'listCustomers' | 'listDisputes' | 'listPayouts'

interface Sent {
  verb: 'get' | 'post'
  path: string
  args: Record<string, unknown>
  apiKey: string
}

interface Case {
  method: Method
  path: string
  prefix: string
  /** Whether the upstream reports a count (or the adapter walks with pageByRows), so hasMore is exact. */
  exact: boolean
}

const CASES: Case[] = [
  { method: 'listCharges', path: '/payments/list', prefix: 'pay', exact: true },
  { method: 'listRefunds', path: '/refunds/list', prefix: 'ref', exact: true },
  { method: 'listCustomers', path: '/customers/list', prefix: 'cus', exact: false },
  { method: 'listDisputes', path: '/disputes/list', prefix: 'dp', exact: false },
  { method: 'listPayouts', path: '/payouts/list', prefix: 'po', exact: true },
]

function makeIds(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(4, '0')}`)
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

/** PageSize: rejected, not clamped, outside 1..max. */
function pageSize(raw: unknown, max: number, fallback = 10): number {
  const n = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > max) throw badRequest(`limit ${String(raw)}`)
  return n
}

/** PageOffset: 0..20000. */
function pageOffsetOf(raw: unknown): number {
  const n = raw === undefined ? 0 : Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 20_000) throw badRequest(`offset ${String(raw)}`)
  return n
}

interface FakeOptions {
  /** Id prefix per api-key (payments only), so two connections hold different rows. */
  prefixByKey?: Record<string, string>
  /**
   * Payments core drops after the DB limit (e.g. filtered intents): they use
   * up a slot of the DB page but never come back, so a page can be short
   * while older rows remain.
   */
  droppedPayments?: ReadonlySet<string>
  /** Groups of payment ids that share one created_at (listed in storage order). */
  tiedPayments?: ReadonlyArray<ReadonlyArray<string>>
  /** Omit `total_count` from refunds and payouts (it is nullable on payouts). */
  noTotalCount?: boolean
}

/**
 * A fake Hyperswitch holding `n` rows per collection (newest first), which
 * reads ONLY the documented parameters of each list endpoint.
 */
function fakeHyperswitch(n: number, opts: FakeOptions = {}) {
  const sent: Sent[] = []
  const paymentsFor = (prefix: string) => {
    const ids = makeIds(prefix, n)
    // created_at descends with position; tied ids share their group's first value.
    const createdAt = new Map(ids.map((id, i) => [id, n - i]))
    for (const group of opts.tiedPayments ?? []) {
      const t = createdAt.get(group[0]!)!
      for (const id of group) createdAt.set(id, t)
    }
    return ids.map((id) => ({
      payment_id: id,
      amount: 1000,
      currency: 'USD',
      created: createdAt.get(id)!,
    }))
  }
  const data = {
    refunds: makeIds('ref', n).map((id) => ({ refund_id: id, amount: 100, currency: 'USD' })),
    customers: makeIds('cus', n).map((id) => ({ customer_id: id })),
    disputes: makeIds('dp', n).map((id) => ({ dispute_id: id, amount: '100', currency: 'USD' })),
    payouts: makeIds('po', n).map((id) => ({ payout_id: id, amount: 100, currency: 'USD' })),
  }
  const makeGet = (apiKey: string) =>
    vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
      const q = { ...(config?.params ?? {}) }
      sent.push({ verb: 'get', path, args: q, apiKey })
      if (path === '/payments/list') {
        const payments = paymentsFor(opts.prefixByKey?.[apiKey] ?? 'pay')
        const limit = pageSize(q.limit, MAX)
        let pool = payments
        if (q.ending_before !== undefined) {
          // created_at <= anchor.created_at, newest first (ties in storage order).
          const anchor = payments.find((p) => p.payment_id === q.ending_before)
          if (!anchor) throw badRequest('ending_before')
          pool = payments.filter((p) => p.created <= anchor.created)
        }
        // The DB limit applies first; core then drops some intents.
        const rows = pool
          .slice(0, limit)
          .filter((p) => !opts.droppedPayments?.has(p.payment_id))
          .map(({ created: _created, ...p }) => p)
        return { data: { size: rows.length, data: rows } }
      }
      return getOther(path, q)
    })
  const getOther = (path: string, q: Record<string, unknown>) => {
    if (path === '/customers/list') {
      // limit: u16 with no documented maximum.
      const limit = q.limit === undefined ? 10 : Number(q.limit)
      if (!Number.isInteger(limit) || limit < 0 || limit > 65_535) throw badRequest('limit')
      const offset = q.offset === undefined ? 0 : Number(q.offset)
      return { data: data.customers.slice(offset, offset + limit) }
    }
    if (path === '/disputes/list') {
      const limit = pageSize(q.limit, MAX)
      const offset = pageOffsetOf(q.offset)
      return { data: data.disputes.slice(offset, offset + limit) }
    }
    throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
  }
  const total = (t: number) => (opts.noTotalCount ? {} : { total_count: t })
  const makePost = (apiKey: string) =>
    vi.fn(async (path: string, body?: Record<string, unknown>) => postOne(apiKey, path, body))
  const postOne = (apiKey: string, path: string, body?: Record<string, unknown>) => {
    const b = { ...(body ?? {}) }
    sent.push({ verb: 'post', path, args: b, apiKey })
    if (path === '/refunds/list') {
      const limit = pageSize(b.limit, MAX)
      const offset = pageOffsetOf(b.offset)
      const rows = data.refunds.slice(offset, offset + limit)
      return { data: { count: rows.length, ...total(data.refunds.length), data: rows } }
    }
    if (path === '/payouts/list') {
      const limit = pageSize(b.limit, PAYOUTS_MAX)
      const offset = pageOffsetOf(b.offset)
      const rows = data.payouts.slice(offset, offset + limit)
      return { data: { size: rows.length, ...total(data.payouts.length), data: rows } }
    }
    throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
  }
  vi.spyOn(axios, 'create').mockImplementation(((config?: {
    headers?: Record<string, unknown>
  }) => {
    const apiKey = String(config?.headers?.['api-key'] ?? '')
    return { get: makeGet(apiKey), post: makePost(apiKey) }
  }) as never)
  return { sent }
}

async function callPage(
  adapter: HyperswitchAdapter,
  method: Method,
  page: number,
  limit: number,
  creds: Credentials = CREDS,
) {
  const params = withPageSink({ page, limit })
  const items = (await adapter[method](creds, params)) as Array<{ id: string }>
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, params }
}

beforeEach(() => {
  _resetCursorPager()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(CASES)('Hyperswitch $method paging', ({ method, path, prefix, exact }) => {
  it('serves 2L+1 rows over three pages, each id once, in order, with exact hasMore', async () => {
    const L = 3
    fakeHyperswitch(2 * L + 1)
    const adapter = new HyperswitchAdapter()
    const p1 = await callPage(adapter, method, 1, L)
    const p2 = await callPage(adapter, method, 2, L)
    const p3 = await callPage(adapter, method, 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(makeIds(prefix, 2 * L + 1))
    // Bare-array endpoints report no count: a full page is undecidable, a
    // short one is the end.
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual(
      exact ? [true, true, false] : [undefined, undefined, false],
    )
    const p4 = await callPage(adapter, method, 4, L)
    expect(p4.ids).toEqual([])
    expect(p4.hasMore).toBe(false)
  })

  it('clamps a limit above the maximum and still serves every row', async () => {
    const n = 2 * MAX + 1
    const { sent } = fakeHyperswitch(n)
    const adapter = new HyperswitchAdapter()
    const pages = []
    for (let k = 1; k <= 4; k++) pages.push(await callPage(adapter, method, k, 1000))
    const cap = method === 'listPayouts' ? PAYOUTS_MAX : MAX
    expect(sent.every((s) => Number(s.args.limit) <= cap)).toBe(true)
    const all = pages.flatMap((p) => p.ids)
    expect(all).toEqual(makeIds(prefix, n))
    expect(new Set(all).size).toBe(n)
    expect(sent.every((s) => s.path === path)).toBe(true)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    fakeHyperswitch(5)
    const adapter = new HyperswitchAdapter()
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as PageMaxBearing,
      )
      const items: unknown[] = await adapter[method](CREDS, params)
      return listPage(items, params, 'hyperswitch')
    }
    const r1 = await run(1)
    expect(r1.data).toHaveLength(2)
    expect(r1.meta.hasMore).toBe(exact ? true : null)
    const r3 = await run(3)
    expect(r3.data).toHaveLength(1)
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Hyperswitch page-2 requests carry the documented position', () => {
  it('listCharges: page 2 walks on with ending_before=<last payment_id> and drops the anchor', async () => {
    const L = 60
    const { sent } = fakeHyperswitch(2 * L + 1)
    const adapter = new HyperswitchAdapter()
    const p1 = await callPage(adapter, 'listCharges', 1, L)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.args).toEqual({ limit: MAX })
    sent.length = 0
    const p2 = await callPage(adapter, 'listCharges', 2, L)
    expect(sent.length).toBeGreaterThanOrEqual(1)
    expect(sent[0]!.path).toBe('/payments/list')
    expect(sent[0]!.args).toEqual({ limit: MAX, ending_before: 'pay_0100' })
    const all = makeIds('pay', 2 * L + 1)
    expect(p1.ids).toEqual(all.slice(0, L))
    expect(p2.ids).toEqual(all.slice(L, 2 * L))
    expect(p2.hasMore).toBe(true)
  })

  it.each([
    ['listRefunds', '/refunds/list', 'post'],
    ['listCustomers', '/customers/list', 'get'],
    ['listDisputes', '/disputes/list', 'get'],
  ] as const)('%s: page 2 sends offset = limit', async (method, path, verb) => {
    const L = 4
    const { sent } = fakeHyperswitch(10)
    const adapter = new HyperswitchAdapter()
    await callPage(adapter, method, 1, L)
    expect(sent[0]!.args).toMatchObject({ limit: L, offset: 0 })
    sent.length = 0
    const p2 = await callPage(adapter, method, 2, L)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ verb, path, args: { limit: L, offset: L } })
    expect(p2.ids).toHaveLength(L)
  })

  it('listPayouts: page 2 continues at the next 20-row offset', async () => {
    const L = 25
    const { sent } = fakeHyperswitch(2 * L + 1)
    const adapter = new HyperswitchAdapter()
    await callPage(adapter, 'listPayouts', 1, L)
    expect(sent.map((s) => s.args)).toEqual([
      { limit: PAYOUTS_MAX, offset: 0 },
      { limit: PAYOUTS_MAX, offset: 20 },
    ])
    sent.length = 0
    const p2 = await callPage(adapter, 'listPayouts', 2, L)
    expect(sent.map((s) => s.args)).toEqual([{ limit: PAYOUTS_MAX, offset: 40 }])
    expect(p2.ids).toEqual(makeIds('po', 2 * L + 1).slice(L, 2 * L))
    expect(p2.hasMore).toBe(true)
  })
})

describe('Hyperswitch paging details', () => {
  it('reports the clamped page size for an offset method asked for more than 100', async () => {
    fakeHyperswitch(3)
    const adapter = new HyperswitchAdapter()
    const p = await callPage(adapter, 'listRefunds', 1, 1000)
    expect(readUpstreamPage(p.params)?.pageSize).toBe(MAX)
  })

  it('never sends a payouts limit above 20 on a direct call with no limit', async () => {
    const { sent } = fakeHyperswitch(3)
    const adapter = new HyperswitchAdapter()
    await adapter.listPayouts(CREDS, {})
    expect(sent.every((s) => Number(s.args.limit) <= PAYOUTS_MAX)).toBe(true)
  })

  it('keeps each connection on its own charges walk (no rows cross connections)', async () => {
    const { sent } = fakeHyperswitch(250, { prefixByKey: { key_a: 'A', key_b: 'B' } })
    const adapter = new HyperswitchAdapter()
    // A's walk has fetched 100 rows and served 60 of them.
    const a1 = await callPage(adapter, 'listCharges', 1, 60, { accessToken: 'key_a' })
    expect(a1.ids.every((id) => id.startsWith('A_'))).toBe(true)
    sent.length = 0
    // B asks for rows 61..80, which a shared walk could serve from A's buffer.
    const b4 = await callPage(adapter, 'listCharges', 4, 20, { accessToken: 'key_b' })
    expect(b4.ids).toEqual(makeIds('B', 250).slice(60, 80))
    expect(sent.length).toBeGreaterThanOrEqual(1)
    expect(sent.every((s) => s.apiKey === 'key_b')).toBe(true)
  })

  it('listCharges: a short upstream page is not the end (core drops rows after the DB limit)', async () => {
    const n = 250
    const dropped = new Set(['pay_0098', 'pay_0099', 'pay_0100'])
    const { sent } = fakeHyperswitch(n, { droppedPayments: dropped })
    const adapter = new HyperswitchAdapter()
    const visible = makeIds('pay', n).filter((id) => !dropped.has(id))
    const pages = []
    for (let k = 1; k <= 3; k++) pages.push(await callPage(adapter, 'listCharges', k, MAX))
    expect(sent[0]!.args).toEqual({ limit: MAX })
    expect(pages[0]!.ids).toEqual(visible.slice(0, MAX))
    expect(pages[0]!.hasMore).toBe(true)
    expect(pages.flatMap((p) => p.ids)).toEqual(visible)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
  })

  it('listCharges: rows tied with the anchor on created_at are served once each', async () => {
    const n = 150
    // pay_0099 sorts ahead of the anchor pay_0100 and pay_0101 after it, all
    // at one created_at, so `created_at <= anchor` returns pay_0099 again first.
    const { sent } = fakeHyperswitch(n, { tiedPayments: [['pay_0099', 'pay_0100', 'pay_0101']] })
    const adapter = new HyperswitchAdapter()
    const p1 = await callPage(adapter, 'listCharges', 1, MAX)
    const p2 = await callPage(adapter, 'listCharges', 2, MAX)
    expect(sent[1]!.args).toEqual({ limit: MAX, ending_before: 'pay_0100' })
    const all = [...p1.ids, ...p2.ids]
    expect(all).toEqual(makeIds('pay', n))
    expect(new Set(all).size).toBe(n)
    expect(p2.hasMore).toBe(false)
  })

  it('listRefunds without total_count: a short page is the end, a full one reports nothing', async () => {
    fakeHyperswitch(7, { noTotalCount: true })
    const adapter = new HyperswitchAdapter()
    const pages = []
    for (let k = 1; k <= 3; k++) pages.push(await callPage(adapter, 'listRefunds', k, 3))
    expect(pages.flatMap((p) => p.ids)).toEqual(makeIds('ref', 7))
    expect(pages.map((p) => p.hasMore)).toEqual([undefined, undefined, false])
  })

  it('listPayouts without total_count: a full 20-row page means more', async () => {
    const n = 45
    fakeHyperswitch(n, { noTotalCount: true })
    const adapter = new HyperswitchAdapter()
    const pages = []
    for (let k = 1; k <= 3; k++) pages.push(await callPage(adapter, 'listPayouts', k, PAYOUTS_MAX))
    expect(pages.flatMap((p) => p.ids)).toEqual(makeIds('po', n))
    expect(pages[0]!.hasMore).toBe(true)
    expect(pages[1]!.hasMore).toBe(true)
    expect(pages[2]!.hasMore).toBe(false)
  })

  it('listPayouts ends on total_count when the last page is full, with no extra request', async () => {
    const n = 2 * PAYOUTS_MAX
    const { sent } = fakeHyperswitch(n)
    const adapter = new HyperswitchAdapter()
    const p1 = await callPage(adapter, 'listPayouts', 1, PAYOUTS_MAX)
    const p2 = await callPage(adapter, 'listPayouts', 2, PAYOUTS_MAX)
    expect([...p1.ids, ...p2.ids]).toEqual(makeIds('po', n))
    expect(p1.hasMore).toBe(true)
    expect(p2.hasMore).toBe(false)
    expect(sent.map((s) => s.args.offset)).toEqual([0, 20])
  })

  it('declares maxPageSize 100, the PageSize maximum', () => {
    expect(new HyperswitchAdapter().capabilities.maxPageSize).toBe(MAX)
    const params = parseListQuery({ limit: '500' }, new HyperswitchAdapter() as PageMaxBearing)
    expect(params.limit).toBe(MAX)
  })
})
