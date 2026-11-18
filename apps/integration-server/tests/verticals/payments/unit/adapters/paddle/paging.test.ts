/**
 * Paddle list paging: 1-based `page` + caller's `limit` → Paddle Billing's
 * `after` keyset.
 *
 * Every list endpoint pages the same way
 * (https://developer.paddle.com/api-reference/about/pagination.md):
 *   - `per_page`, clamped by Paddle to the endpoint's maximum ("If you request
 *     more than the maximum, Paddle returns the maximum"): customers,
 *     subscriptions and prices 50 by default / 200 max; transactions 30 / 30;
 *     adjustments 10 / 50.
 *   - `after` — "Return entities after the specified Paddle ID".
 *   - `meta.pagination.next` — "Always returned, even if `has_more` is
 *     `false`", so only `has_more` says whether another page exists.
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
import { PaddleAdapter } from '../../../../../../src/verticals/payments/adapters/paddle/index'

const CREDS: Credentials = {
  accessToken: 'pdl_sdbx_apikey_test',
  extra: { environment: 'sandbox' },
}

type Method =
  | 'listCustomers'
  | 'listSubscriptions'
  | 'listCharges'
  | 'listInvoices'
  | 'listRefunds'
  | 'listDisputes'
  | 'listPlans'
  | 'listPaymentMethods'

interface Case {
  method: Method
  path: string
  action?: string
  prefix: string
  max: number
  extra?: Record<string, unknown>
}

const PM_PATH = '/customers/ctm_0001/payment-methods'

const CASES: Case[] = [
  { method: 'listCustomers', path: '/customers', prefix: 'ctm', max: 200 },
  { method: 'listSubscriptions', path: '/subscriptions', prefix: 'sub', max: 200 },
  { method: 'listCharges', path: '/transactions', prefix: 'txn', max: 30 },
  { method: 'listInvoices', path: '/transactions', prefix: 'txn', max: 30 },
  { method: 'listRefunds', path: '/adjustments', action: 'refund', prefix: 'adj_ref', max: 50 },
  {
    method: 'listDisputes',
    path: '/adjustments',
    action: 'chargeback',
    prefix: 'adj_cbk',
    max: 50,
  },
  { method: 'listPlans', path: '/prices', prefix: 'pri', max: 200 },
  {
    method: 'listPaymentMethods',
    path: PM_PATH,
    prefix: 'paymtd',
    max: 200,
    extra: { customer_id: 'ctm_0001' },
  },
]

/** Documented per_page default and maximum for each list endpoint. */
const PER_PAGE: Record<string, { def: number; max: number }> = {
  '/customers': { def: 50, max: 200 },
  '/subscriptions': { def: 50, max: 200 },
  '/prices': { def: 50, max: 200 },
  '/transactions': { def: 30, max: 30 },
  '/adjustments': { def: 10, max: 50 },
  [PM_PATH]: { def: 50, max: 200 },
}

function makeIds(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(4, '0')}`)
}

interface Sent {
  path: string
  params: Record<string, unknown>
  apiKey: string
}

/**
 * A fake Paddle holding `n` rows per collection, reading ONLY `per_page`,
 * `after` and (on /adjustments) `action`. `next` is always returned, and
 * `has_more` is the only honest continuation signal.
 */
interface FakeOptions {
  /** meta.pagination.estimated_total; defaults to the collection size. */
  estimatedTotal?: number
  /** 'url' (default), 'absent', or 'garbage' (an unparsable next). */
  next?: 'url' | 'absent' | 'garbage'
  /** Row id prefix per API key, so a foreign cursor is a 400. */
  tagFor?: (apiKey: string) => string
}

function fakePaddle(n: number, opts: FakeOptions = {}) {
  const sent: Sent[] = []
  const rowsFor = (path: string, action: unknown, tag: string): Array<Record<string, unknown>> => {
    const ids = (prefix: string) => makeIds(tag + prefix, n)
    if (path === PM_PATH) return ids('paymtd').map((id) => ({ id, customer_id: 'ctm_0001' }))
    if (path === '/adjustments') {
      if (action === 'refund') return ids('adj_ref').map((id) => ({ id, action }))
      if (action === 'chargeback') return ids('adj_cbk').map((id) => ({ id, action }))
      return []
    }
    const prefix = {
      '/customers': 'ctm',
      '/subscriptions': 'sub',
      '/transactions': 'txn',
      '/prices': 'pri',
    }[path]
    if (!prefix) throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    return ids(prefix).map((id) => ({ id }))
  }
  const makeGet = (apiKey: string) =>
    vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
      const q = { ...(config?.params ?? {}) }
      sent.push({ path, params: q, apiKey })
      const pp = PER_PAGE[path]
      if (!pp) throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
      const asked = q.per_page === undefined ? pp.def : Number(q.per_page)
      const perPage = Math.min(asked, pp.max)
      const all = rowsFor(path, q.action, opts.tagFor?.(apiKey) ?? '')
      let start = 0
      if (q.after !== undefined) {
        const at = all.findIndex((r) => r.id === q.after)
        if (at < 0) throw Object.assign(new Error('400 after'), { response: { status: 400 } })
        start = at + 1
      }
      const data = all.slice(start, start + perPage)
      const last = data[data.length - 1]?.id ?? q.after
      const nextQuery = new URLSearchParams()
      if (q.action !== undefined) nextQuery.set('action', String(q.action))
      nextQuery.set('per_page', String(perPage))
      if (last !== undefined) nextQuery.set('after', String(last))
      return {
        data: {
          data,
          meta: {
            request_id: 'req',
            pagination: {
              per_page: perPage,
              ...(opts.next === 'absent'
                ? {}
                : {
                    next:
                      opts.next === 'garbage'
                        ? 'not a url'
                        : `https://sandbox-api.paddle.com${path}?${nextQuery.toString()}`,
                  }),
              has_more: start + data.length < all.length,
              estimated_total: opts.estimatedTotal ?? all.length,
            },
          },
        },
      }
    })
  vi.spyOn(axios, 'create').mockImplementation(((config?: { headers?: Record<string, string> }) => {
    const auth = String(config?.headers?.Authorization ?? config?.headers?.authorization ?? '')
    return { get: makeGet(auth.replace(/^Bearer /, '')), post: vi.fn() }
  }) as never)
  return { sent }
}

async function callPage(
  adapter: PaddleAdapter,
  method: Method,
  page: number,
  limit: number,
  extra: Record<string, unknown> = {},
  creds: Credentials = CREDS,
) {
  const params = withPageSink({ ...extra, page, limit })
  const items = (await adapter[method](creds, params)) as Array<{ id: string }>
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, params }
}

beforeEach(() => {
  _resetCursorPager()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(CASES)('Paddle $method paging', ({ method, path, action, prefix, max, extra }) => {
  it('serves 2L+1 rows over three pages, each id once, in order, with exact hasMore', async () => {
    const L = 3
    fakePaddle(2 * L + 1)
    const adapter = new PaddleAdapter()
    const p1 = await callPage(adapter, method, 1, L, extra)
    const p2 = await callPage(adapter, method, 2, L, extra)
    const p3 = await callPage(adapter, method, 3, L, extra)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(makeIds(prefix, 2 * L + 1))
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    const p4 = await callPage(adapter, method, 4, L, extra)
    expect(p4.ids).toEqual([])
    expect(p4.hasMore).toBe(false)
  })

  it('page 2 sends after=<last id of page 1> at the caller page size', async () => {
    const L = 4
    const { sent } = fakePaddle(2 * L + 1)
    const adapter = new PaddleAdapter()
    const p1 = await callPage(adapter, method, 1, L, extra)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.path).toBe(path)
    expect(sent[0]!.params).toEqual({ ...(action ? { action } : {}), per_page: L })
    sent.length = 0
    const p2 = await callPage(adapter, method, 2, L, extra)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.path).toBe(path)
    expect(sent[0]!.params).toEqual({
      ...(action ? { action } : {}),
      per_page: L,
      after: p1.ids[L - 1],
    })
    expect(p2.ids).toEqual(makeIds(prefix, 2 * L + 1).slice(L, 2 * L))
  })

  it('clamps a limit above the maximum, reports the size sent, and still serves every row', async () => {
    const limit = 500
    const n = 2 * max + 1
    const { sent } = fakePaddle(n)
    const adapter = new PaddleAdapter()
    const pages = []
    for (let k = 1; k <= 3; k++) pages.push(await callPage(adapter, method, k, limit, extra))
    expect(sent.map((s) => s.params.per_page)).toEqual([max, max, max])
    expect(sent.every((s) => s.path === path)).toBe(true)
    expect(pages.map((p) => readUpstreamPage(p.params)?.pageSize)).toEqual([max, max, max])
    expect(pages.map((p) => p.ids.length)).toEqual([max, max, 1])
    const all = pages.flatMap((p) => p.ids)
    expect(all).toEqual(makeIds(prefix, n))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
  })

  it('at the router ceiling, meta.limit is the size sent and meta.hasMore stays true', async () => {
    fakePaddle(max + 1)
    const adapter = new PaddleAdapter()
    const params: QueryParams = Object.assign(
      parseListQuery({ limit: '500' }, adapter as PageMaxBearing),
      extra,
    )
    const items: unknown[] = await adapter[method](CREDS, params)
    const r = listPage(items, params, 'paddle')
    expect(r.data).toHaveLength(max)
    expect(r.meta.limit).toBe(max)
    expect(r.meta.hasMore).toBe(true)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    fakePaddle(5)
    const adapter = new PaddleAdapter()
    const run = async (page: number) => {
      const params: QueryParams = Object.assign(
        parseListQuery({ limit: '2', page: String(page) }, adapter as PageMaxBearing),
        extra,
      )
      const items: unknown[] = await adapter[method](CREDS, params)
      return listPage(items, params, 'paddle')
    }
    const r1 = await run(1)
    expect(r1.data).toHaveLength(2)
    expect(r1.meta.hasMore).toBe(true)
    const r3 = await run(3)
    expect(r3.data).toHaveLength(1)
    expect(r3.meta.hasMore).toBe(false)
  })

  it('ends on has_more=false when the last page is exactly full', async () => {
    const L = 3
    const { sent } = fakePaddle(2 * L)
    const adapter = new PaddleAdapter()
    const p1 = await callPage(adapter, method, 1, L, extra)
    const p2 = await callPage(adapter, method, 2, L, extra)
    expect([...p1.ids, ...p2.ids]).toEqual(makeIds(prefix, 2 * L))
    expect([p1.hasMore, p2.hasMore]).toEqual([true, false])
    expect(sent).toHaveLength(2)
  })
})

describe('Paddle paging details', () => {
  it('keeps refunds and chargebacks on separate walks', async () => {
    const { sent } = fakePaddle(7)
    const adapter = new PaddleAdapter()
    await callPage(adapter, 'listRefunds', 1, 3)
    const d2 = await callPage(adapter, 'listDisputes', 2, 3)
    expect(d2.ids).toEqual(makeIds('adj_cbk', 7).slice(3, 6))
    expect(sent.filter((s) => s.params.action === 'chargeback')[0]!.params.after).toBeUndefined()
  })

  it('keeps each connection on its own walk (a foreign cursor is never sent)', async () => {
    // Each API key sees its own ids; an `after` from another key is a 400.
    const { sent } = fakePaddle(7, { tagFor: (k) => (k === 'key_b' ? 'b_' : 'a_') })
    const A: Credentials = { accessToken: 'key_a', extra: { environment: 'sandbox' } }
    const B: Credentials = { accessToken: 'key_b', extra: { environment: 'sandbox' } }
    const adapter = new PaddleAdapter()
    await callPage(adapter, 'listCustomers', 1, 3, {}, A)
    sent.length = 0
    const b2 = await callPage(adapter, 'listCustomers', 2, 3, {}, B)
    expect(b2.ids).toEqual(makeIds('b_ctm', 7).slice(3, 6))
    expect(sent.every((s) => s.apiKey === 'key_b')).toBe(true)
    expect(sent[0]!.params.after).toBeUndefined()
  })

  it('never reuses a cursor minted at another page size', async () => {
    const { sent } = fakePaddle(12)
    const adapter = new PaddleAdapter()
    await callPage(adapter, 'listCustomers', 1, 3)
    sent.length = 0
    const p2 = await callPage(adapter, 'listCustomers', 2, 5)
    expect(p2.ids).toEqual(makeIds('ctm', 12).slice(5, 10))
    expect(sent[0]!.params).toEqual({ per_page: 5 })
  })

  it('never sends a cursor from one collection to another endpoint', async () => {
    const { sent } = fakePaddle(7)
    const adapter = new PaddleAdapter()
    await callPage(adapter, 'listCustomers', 1, 3)
    sent.length = 0
    const s2 = await callPage(adapter, 'listSubscriptions', 2, 3)
    expect(s2.ids).toEqual(makeIds('sub', 7).slice(3, 6))
    expect(sent[0]!.params.after).toBeUndefined()
  })

  it('keeps payment-method walks per customer', async () => {
    const { sent } = fakePaddle(7)
    const adapter = new PaddleAdapter()
    await callPage(adapter, 'listPaymentMethods', 1, 3, { customer_id: 'ctm_0001' })
    sent.length = 0
    // A different customer's page 2 must start its own walk, not reuse the cursor.
    await expect(
      callPage(adapter, 'listPaymentMethods', 2, 3, { customer_id: 'ctm_0002' }),
    ).rejects.toThrow()
    expect(sent[0]!.path).toBe('/customers/ctm_0002/payment-methods')
    expect(sent[0]!.params.after).toBeUndefined()
  })

  it('reports estimated_total as totalCount', async () => {
    fakePaddle(7)
    const adapter = new PaddleAdapter()
    const p1 = await callPage(adapter, 'listCustomers', 1, 3)
    expect(readUpstreamPage(p1.params)?.totalCount).toBe(7)
  })

  it.each([
    ['above 100,000 (100001)', 100_001],
    ['skipped (-1)', -1],
  ])('does not report a totalCount when estimated_total is %s', async (_label, est) => {
    fakePaddle(7, { estimatedTotal: est })
    const adapter = new PaddleAdapter()
    const p1 = await callPage(adapter, 'listCustomers', 1, 3)
    expect(p1.hasMore).toBe(true)
    expect(readUpstreamPage(p1.params)?.totalCount).toBeUndefined()
  })

  it.each(['absent', 'garbage'] as const)(
    'falls back to the last row id when next is %s',
    async (next) => {
      const { sent } = fakePaddle(7, { next })
      const adapter = new PaddleAdapter()
      const p1 = await callPage(adapter, 'listCustomers', 1, 3)
      const p2 = await callPage(adapter, 'listCustomers', 2, 3)
      expect(sent[1]!.params.after).toBe(p1.ids[2])
      expect(p2.ids).toEqual(makeIds('ctm', 7).slice(3, 6))
    },
  )

  it('a direct call with no limit never asks transactions for more than 30', async () => {
    const { sent } = fakePaddle(3)
    const adapter = new PaddleAdapter()
    await adapter.listCharges(CREDS, {})
    expect(sent.every((s) => Number(s.params.per_page) <= 30)).toBe(true)
  })
})
