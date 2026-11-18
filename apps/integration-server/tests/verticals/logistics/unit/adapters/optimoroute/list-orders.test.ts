/**
 * OptimoRoute listOrders over Search Orders, `POST /v1/search_orders`
 * (https://optimoroute.com/api/, "Search Orders"):
 *
 * - "At least one of orders or dateRange properties must be specified in the
 *   request." dateRange "can span at most 35 days, i.e. 5 weeks."
 * - includeOrderData: "Set this to true if you need to fetch the order data".
 * - "Up to 500 orders will be returned in one call. Use after_tag to fetch the
 *   remaining pages." after_tag is "Only present if the there are more pages";
 *   the next call repeats "all the parameters ... with same values".
 *
 * The docs name no lookback limit, so an unfiltered call is refused (501) and
 * a call with updatedAfter walks 35-day order-date windows newest first.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { listPage, readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { OptimorouteAdapter } from '../../../../../../src/verticals/logistics/adapters/optimoroute/index'
import { SEARCH_ORDER_DATA, GET_ORDER_DATA } from './fixtures/search-orders'

const NOW = new Date('2026-09-24T12:00:00.000Z')
const DOCUMENTED_BODY_KEYS = new Set([
  'orders',
  'dateRange',
  'orderStatus',
  'includeOrderData',
  'includeScheduleInformation',
  'after_tag',
])
const DAY_MS = 86_400_000
const CALL_BUDGET = 50

let tokenSeq = 0
/** A fresh connection per test, so the row pager's memo never carries over. */
function creds() {
  return { accessToken: `optimo_test_${++tokenSeq}_${Math.random()}` }
}

interface Body {
  dateRange?: { from: string; to: string }
  includeOrderData?: boolean
  after_tag?: string
  [k: string]: unknown
}

/**
 * A fake OptimoRoute honouring only the documented search_orders contract.
 * `orders` are [id, date] pairs; `batch` is the fake's per-call row count
 * (the real one is "up to 500"); it varies by call to make pages uneven.
 */
function fakeOptimoroute(
  orders: Array<[string, string]> | ((apiKey: string) => Array<[string, string]>),
  batch: (call: number) => number,
) {
  const calls: Body[] = []
  const post = vi.fn(
    async (path: string, body: Body, cfg?: { params?: Record<string, unknown> }) => {
      if (calls.length >= CALL_BUDGET) throw new Error('call budget exceeded')
      expect(cfg?.params).toEqual({ key: expect.any(String) })
      if (path === 'get_orders') {
        const want = (body as { orders: Array<{ id?: string }> }).orders[0]?.id
        return {
          data: {
            success: true,
            orders:
              want === GET_ORDER_DATA.id
                ? [{ success: true, id: want, data: GET_ORDER_DATA }]
                : [{ success: false, id: want, code: 'ERR_ORD_NOT_FOUND' }],
          },
        }
      }
      if (path !== 'search_orders') throw new Error(`unexpected path ${path}`)
      calls.push(body)
      for (const k of Object.keys(body)) {
        if (!DOCUMENTED_BODY_KEYS.has(k)) throw new Error(`undocumented property ${k}`)
      }
      const range = body.dateRange
      if (!range) return { data: { success: false } }
      const span = (Date.parse(range.to) - Date.parse(range.from)) / DAY_MS + 1
      if (!(span >= 1 && span <= 35)) throw new Error(`dateRange spans ${span} days`)
      const apiKey = String(cfg?.params?.key)
      const all = typeof orders === 'function' ? orders(apiKey) : orders
      const hits = all.filter(([, d]) => d >= range.from && d <= range.to)
      let offset = 0
      if (body.after_tag !== undefined) {
        const tag = JSON.parse(body.after_tag) as {
          key: string
          from: string
          to: string
          offset: number
        }
        // A tag belongs to the search (and the account) that returned it.
        if (tag.key !== apiKey || tag.from !== range.from || tag.to !== range.to)
          throw new Error('after_tag with different parameters')
        offset = tag.offset
      }
      const n = batch(calls.length)
      const slice = hits.slice(offset, offset + n)
      const end = offset + slice.length
      return {
        data: {
          success: true,
          orders: slice.map(([id, date]) =>
            body.includeOrderData === true
              ? { id, data: { ...SEARCH_ORDER_DATA, id, orderNo: `NO-${id}`, date } }
              : { id },
          ),
          ...(end < hits.length
            ? {
                after_tag: JSON.stringify({
                  key: apiKey,
                  from: range.from,
                  to: range.to,
                  offset: end,
                }),
              }
            : {}),
        },
      }
    },
  )
  vi.spyOn(axios, 'create').mockReturnValue({
    get: vi.fn(async () => {
      throw new Error('no GET expected')
    }),
    post,
    defaults: { headers: { common: {} } },
  } as never)
  return { post, calls }
}

const adapter = new OptimorouteAdapter()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('optimoroute listOrders without updatedAfter', () => {
  it('refuses with 501 NOT_SUPPORTED naming the required window, and sends nothing', async () => {
    const { post } = fakeOptimoroute([], () => 500)
    const err = await adapter.listOrders(creds(), { page: 1, limit: 10 }).catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/dateRange/)
    expect((err as Error).message).toMatch(/updated_after/)
    expect(post).not.toHaveBeenCalled()
  })
})

describe('optimoroute listOrders with updatedAfter (35-day windows, newest first)', () => {
  // Windows from 2026-07-01 to 2026-09-24 (86 days): 08-21..09-24, 07-17..08-20, 07-01..07-16.
  const UPDATED_AFTER = new Date('2026-07-01T15:30:00.000Z')

  it('sends the documented body: a ≤35-day dateRange from the UTC day of updatedAfter, and includeOrderData', async () => {
    const { calls } = fakeOptimoroute([], () => 500)
    const params = withPageSink({ page: 1, limit: 10, updatedAfter: UPDATED_AFTER })
    expect(await adapter.listOrders(creds(), params)).toEqual([])
    expect(calls).toEqual([
      { dateRange: { from: '2026-08-21', to: '2026-09-24' }, includeOrderData: true },
      { dateRange: { from: '2026-07-17', to: '2026-08-20' }, includeOrderData: true },
      { dateRange: { from: '2026-07-01', to: '2026-07-16' }, includeOrderData: true },
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('walks N = 2L+1 orders across windows and uneven after_tag batches: every id once, hasMore exact', async () => {
    const L = 4
    const orders: Array<[string, string]> = [
      ['a1', '2026-09-20'],
      ['a2', '2026-09-01'],
      ['a3', '2026-08-25'],
      ['a4', '2026-08-21'],
      // window 1 (07-17..08-20) is empty
      ['c1', '2026-07-16'],
      ['c2', '2026-07-10'],
      ['c3', '2026-07-05'],
      ['c4', '2026-07-02'],
      ['c5', '2026-07-01'],
    ]
    expect(orders).toHaveLength(2 * L + 1)
    // Uneven upstream batches: 3, 1, 2, 3, ...
    const { calls } = fakeOptimoroute(orders, (n) => [3, 1, 2, 3, 2, 3][(n - 1) % 6]!)
    const c = creds()
    const seen: string[] = []
    const hasMore: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L, updatedAfter: UPDATED_AFTER })
      const rows = await adapter.listOrders(c, params)
      for (const r of rows) OrderSchema.parse(r)
      const env = listPage(rows, params, 'optimoroute')
      seen.push(...env.data.map((o) => o.id!))
      hasMore.push(env.meta.hasMore as boolean)
    }
    expect(seen).toEqual(orders.map(([id]) => id))
    expect(hasMore).toEqual([true, true, false])
    // Each after_tag call repeats the same dateRange (the fake checks it) and
    // every call asks for order data.
    expect(calls.every((b) => b.includeOrderData === true)).toBe(true)
    expect(calls.some((b) => b.after_tag !== undefined)).toBe(true)
  })

  it('reports hasMore true when rows remain in an older window only', async () => {
    fakeOptimoroute(
      [
        ['a1', '2026-09-20'],
        ['c1', '2026-07-02'],
      ],
      () => 500,
    )
    const params = withPageSink({ page: 1, limit: 1, updatedAfter: UPDATED_AFTER })
    const rows = await adapter.listOrders(creds(), params)
    expect(rows.map((o) => o.id)).toEqual(['a1'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an updatedAfter later than today sends nothing and reports the end', async () => {
    const { post } = fakeOptimoroute([], () => 500)
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2026-09-25T00:00:00.000Z'),
    })
    expect(await adapter.listOrders(creds(), params)).toEqual([])
    expect(post).not.toHaveBeenCalled()
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('throws on a search_orders entry without data rather than dropping it', async () => {
    vi.spyOn(axios, 'create').mockReturnValue({
      post: vi.fn(async () => ({
        data: {
          success: true,
          orders: [{ id: 'x1', data: { ...SEARCH_ORDER_DATA, id: 'x1' } }, { id: 'x2' }],
        },
      })),
      defaults: { headers: { common: {} } },
    } as never)
    const params: QueryParams = { page: 1, limit: 5, updatedAfter: UPDATED_AFTER }
    await expect(adapter.listOrders(creds(), params)).rejects.toThrow(/x2 without data/)
  })

  it('throws on success: false instead of returning an empty page', async () => {
    vi.spyOn(axios, 'create').mockReturnValue({
      post: vi.fn(async () => ({ data: { success: false } })),
      defaults: { headers: { common: {} } },
    } as never)
    const params: QueryParams = { page: 1, limit: 5, updatedAfter: UPDATED_AFTER }
    await expect(adapter.listOrders(creds(), params)).rejects.toThrow(/success: false/)
  })
})

describe('optimoroute listOrders pager key isolation', () => {
  const UPDATED_AFTER = new Date('2026-07-01T15:30:00.000Z')

  it('never serves one connection the rows another connection fetched', async () => {
    const a = creds()
    const b = creds()
    fakeOptimoroute(
      (key) =>
        key === a.accessToken
          ? [
              ['a1', '2026-09-20'],
              ['a2', '2026-09-10'],
            ]
          : [
              ['b1', '2026-09-21'],
              ['b2', '2026-09-11'],
            ],
      () => 1,
    )
    // One row per upstream page, so a page 2 resumes from a memoised after_tag.
    const pageOf = async (c: { accessToken: string }, page: number) =>
      (await adapter.listOrders(c, { page, limit: 1, updatedAfter: UPDATED_AFTER })).map(
        (o) => o.id,
      )
    expect(await pageOf(a, 1)).toEqual(['a1'])
    expect(await pageOf(a, 2)).toEqual(['a2'])
    expect(await pageOf(b, 2)).toEqual(['b2'])
    expect(await pageOf(b, 1)).toEqual(['b1'])
  })

  it('never serves a walk from one updatedAfter the rows of a walk from another', async () => {
    const c = creds()
    const { calls } = fakeOptimoroute(
      [
        ['a1', '2026-09-20'],
        ['a2', '2026-08-25'],
      ],
      () => 500,
    )
    // From 07-01, window 0 is 08-21..09-24: both orders, one per page.
    const wide = await adapter.listOrders(c, { page: 1, limit: 1, updatedAfter: UPDATED_AFTER })
    expect(wide.map((o) => o.id)).toEqual(['a1'])
    // From 09-01 the only window is 09-01..09-24, and a2 (08-25) is outside it.
    const params = withPageSink({
      page: 2,
      limit: 1,
      updatedAfter: new Date('2026-09-01T00:00:00.000Z'),
    })
    expect(await adapter.listOrders(c, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.at(-1)?.dateRange).toEqual({ from: '2026-09-01', to: '2026-09-24' })
  })
})

describe('optimoroute getOrder', () => {
  it('reads back a listed id through get_orders by OptimoRoute id', async () => {
    const { post } = fakeOptimoroute([], () => 500)
    const order = OrderSchema.parse(await adapter.getOrder(creds(), GET_ORDER_DATA.id))
    expect(order.id).toBe(GET_ORDER_DATA.id)
    expect(post).toHaveBeenCalledWith(
      'get_orders',
      { orders: [{ id: GET_ORDER_DATA.id }] },
      expect.anything(),
    )
  })

  it('throws when the order is not found', async () => {
    fakeOptimoroute([], () => 500)
    await expect(adapter.getOrder(creds(), 'missing')).rejects.toThrow(/not found/)
  })
})
