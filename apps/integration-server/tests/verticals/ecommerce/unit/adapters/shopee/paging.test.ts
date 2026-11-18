/**
 * Shopee listOrders paging: get_order_list is an opaque-cursor endpoint.
 *
 * From the Shopee Open Platform v2 docs
 * (https://open.shopee.com/opservice/api/v1/doc/api/?version=2&api_name=v2.order.get_order_list):
 *
 *   next_cursor  "If  more is true, you should pass the next_cursor in the next
 *                 request as cursor. The value of next_cursor will be empty
 *                 string when more is false."
 *   cursor       "Specifies the starting entry of data to return in the current
 *                 call. The default is empty."
 *   page_size    "The limit of page_size if between 1 and 100."
 *   time window  "The maximum date range that may be specified with the
 *                 time_from and time_to fields is 15 days."
 *
 * and v2.order.get_order_detail: order_sn_list "... limit [1,50]".
 *
 * The other list methods are covered by request-shape.test.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  parseListQuery,
  withPageSink,
  readUpstreamPage,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import { ShopeeAdapter } from '../../../../../../src/verticals/ecommerce/adapters/shopee/index'

const CREDS = {
  accessToken: 'tok',
  extra: { partnerId: 1001, partnerKey: 'partner-key', shopId: 2002 },
}

const MAX = 100
const FIFTEEN_DAYS = 15 * 24 * 60 * 60

interface Call {
  path: string
  params: Record<string, unknown>
}

/**
 * A Shopee whose get_order_list honours ONLY cursor, page_size and the time
 * window. Cursors are opaque tokens it minted, bound to the window they were
 * minted under; anything else is refused.
 */
function fakeShopee(total: number) {
  const calls: Call[] = []
  const sns = Array.from({ length: total }, (_, i) => `SN${String(i + 1).padStart(4, '0')}`)
  const minted = new Map<string, { offset: number; window: string; connection: string }>()
  const answer = (path: string, p: Record<string, unknown>): unknown => {
    // The signing interceptor adds shop_id and access_token; a cursor is only
    // good for the connection that minted it.
    const connection = `${String(p['shop_id'])}/${String(p['access_token'])}`
    if (path === '/order/get_order_list') {
      const size = Number(p['page_size'])
      if (!Number.isInteger(size) || size < 1 || size > MAX) {
        throw new Error(`fake shopee: page_size ${String(p['page_size'])} outside [1, ${MAX}]`)
      }
      const from = Number(p['time_from'])
      const to = Number(p['time_to'])
      if (!(from < to) || to - from > FIFTEEN_DAYS) {
        throw new Error('fake shopee: Start time must be earlier than end time and diff in 15days.')
      }
      const window = `${String(p['time_range_field'])}:${from}-${to}`
      const cursor = p['cursor']
      let offset = 0
      if (cursor !== undefined && cursor !== '') {
        const m = minted.get(String(cursor))
        if (!m) throw new Error(`fake shopee: unknown cursor ${String(cursor)}`)
        if (m.window !== window) throw new Error('fake shopee: cursor used under another window')
        if (m.connection !== connection) {
          throw new Error('fake shopee: cursor used under another connection')
        }
        offset = m.offset
      }
      const end = Math.min(offset + size, total)
      const more = end < total
      let next = ''
      if (more) {
        next = `tok-${minted.size + 1}-${end * 7}`
        minted.set(next, { offset: end, window, connection })
      }
      return {
        error: '',
        response: {
          order_list: sns.slice(offset, end).map((order_sn) => ({ order_sn })),
          more,
          next_cursor: next,
        },
      }
    }
    if (path === '/order/get_order_detail') {
      const list = String(p['order_sn_list']).split(',')
      if (list.length > 50) {
        throw new Error(`fake shopee: order_sn_list has ${list.length}, limit [1,50]`)
      }
      return {
        error: '',
        response: { order_list: list.map((order_sn) => ({ order_sn })) },
      }
    }
    throw new Error(`fake shopee: unexpected GET ${path}`)
  }
  type Signer = (config: { url?: string; params?: Record<string, unknown> }) => {
    params?: Record<string, unknown>
  }
  // One fake axios instance per ShopeeClient, running that client's own
  // signing interceptor so each request carries its connection's shop_id
  // and access_token.
  vi.spyOn(axios, 'create').mockImplementation(() => {
    let sign: Signer = (config) => config
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = sign({ url: path, params: { ...cfg?.params } }).params ?? {}
      calls.push({ path, params })
      return { data: answer(path, params) }
    })
    return {
      get,
      post: vi.fn(),
      interceptors: {
        request: {
          use: vi.fn((fn: Signer) => {
            sign = fn
          }),
        },
      },
    } as never
  })
  return { calls, sns }
}

/** Move the clock one second per read, so `now` differs between pages. */
function tickingClock() {
  let t = Date.UTC(2026, 8, 1)
  vi.spyOn(Date, 'now').mockImplementation(() => (t += 1000))
}

const listCalls = (calls: Call[]) => calls.filter((c) => c.path === '/order/get_order_list')

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('ShopeeAdapter listOrders paging', () => {
  it('walks pages 1..3 of 2L+1 orders: every id once, in order, hasMore exact', async () => {
    const L = 4
    const { calls, sns } = fakeShopee(2 * L + 1)
    tickingClock()
    const adapter = new ShopeeAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listOrders(CREDS, params)
      seen.push(...rows.map((o) => o.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(sns)
    expect(more).toEqual([true, true, false])
    // One upstream request per page: the walk resumed from the remembered cursor.
    expect(listCalls(calls)).toHaveLength(3)
  })

  it('page 1 sends the documented empty default cursor and the caller page size', async () => {
    const { calls } = fakeShopee(9)
    await new ShopeeAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: 4 }))
    const p = listCalls(calls)[0]!.params
    expect(p['page_size']).toBe(4)
    expect(p['cursor'] ?? '').toBe('')
  })

  it("page 2 carries page 1's next_cursor as cursor, under the same time window", async () => {
    const { calls } = fakeShopee(9)
    tickingClock()
    const adapter = new ShopeeAdapter()
    await adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 4 }))
    const rows = await adapter.listOrders(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(rows.map((o) => o.id)).toEqual(['SN0005', 'SN0006', 'SN0007', 'SN0008'])
    const [first, second] = listCalls(calls)
    expect(second!.params['cursor']).toBe('tok-1-28')
    expect(second!.params['time_from']).toBe(first!.params['time_from'])
    expect(second!.params['time_to']).toBe(first!.params['time_to'])
  })

  it('a cold page 2 (no walk remembered) still returns the second page', async () => {
    fakeShopee(9)
    const rows = await new ShopeeAdapter().listOrders(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(rows.map((o) => o.id)).toEqual(['SN0005', 'SN0006', 'SN0007', 'SN0008'])
  })

  it('a limit above 100 is clamped, details are chunked at 50, and every row is served', async () => {
    const total = 2 * MAX + 1
    const { calls, sns } = fakeShopee(total)
    tickingClock()
    const adapter = new ShopeeAdapter()
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await adapter.listOrders(CREDS, params)
      seen.push(...rows.map((o) => o.id))
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(sns)
    expect(listCalls(calls).map((c) => c.params['page_size'])).toEqual([MAX, MAX, MAX])
    const details = calls.filter((c) => c.path === '/order/get_order_detail')
    expect(details.every((c) => String(c.params['order_sn_list']).split(',').length <= 50)).toBe(
      true,
    )
  })

  it('through the API path, meta.hasMore follows Shopee more', async () => {
    fakeShopee(9)
    const adapter = new ShopeeAdapter()
    const first = parseListQuery({ page: '1', limit: '4' })
    const rows1 = await adapter.listOrders(CREDS, first)
    expect(listPage(rows1, first, 'shopee').meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '4' })
    const rows3 = await adapter.listOrders(CREDS, last)
    expect(rows3.map((o) => o.id)).toEqual(['SN0009'])
    expect(listPage(rows3, last, 'shopee').meta.hasMore).toBe(false)
  })

  it('an empty collection reports no more and asks for no details', async () => {
    const { calls } = fakeShopee(0)
    const params = withPageSink({ page: 1, limit: 4 })
    expect(await new ShopeeAdapter().listOrders(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls.filter((c) => c.path === '/order/get_order_detail')).toHaveLength(0)
  })

  it('updatedAfter is sent as time_from', async () => {
    const { calls } = fakeShopee(9)
    tickingClock()
    const since = new Date(Date.UTC(2026, 7, 25))
    await new ShopeeAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 4, updatedAfter: since }),
    )
    expect(listCalls(calls)[0]!.params['time_from']).toBe(since.getTime() / 1000)
  })

  it('a walk at one limit does not serve page 2 at another limit', async () => {
    fakeShopee(9)
    tickingClock()
    const adapter = new ShopeeAdapter()
    await adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 4 }))
    const rows = await adapter.listOrders(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((o) => o.id)).toEqual(['SN0004', 'SN0005', 'SN0006'])
  })

  it('a walk under one updatedAfter does not serve page 2 under another', async () => {
    const { calls } = fakeShopee(9)
    tickingClock()
    const adapter = new ShopeeAdapter()
    const x = new Date(Date.UTC(2026, 7, 25))
    const y = new Date(Date.UTC(2026, 7, 28))
    await adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 4, updatedAfter: x }))
    await adapter.listOrders(CREDS, withPageSink({ page: 2, limit: 4, updatedAfter: y }))
    const froms = listCalls(calls).map((c) => c.params['time_from'])
    // y's page 2 walks its own window from page 1; x's cursor is never replayed.
    expect(froms).toEqual([x.getTime() / 1000, y.getTime() / 1000, y.getTime() / 1000])
  })

  it.each([
    ['another access token on the same shop', { ...CREDS, accessToken: 'tok-other' }],
    ['another shop under the same token', { ...CREDS, extra: { ...CREDS.extra, shopId: 3003 } }],
  ])('a walk on one connection is not resumed on %s', async (_label, other) => {
    fakeShopee(9)
    tickingClock()
    const adapter = new ShopeeAdapter()
    await adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 4 }))
    // The fake refuses a cursor minted for another connection.
    const rows = await adapter.listOrders(other, withPageSink({ page: 2, limit: 4 }))
    expect(rows.map((o) => o.id)).toEqual(['SN0005', 'SN0006', 'SN0007', 'SN0008'])
  })

  it('an exactly full last page reports no more', async () => {
    fakeShopee(8)
    const adapter = new ShopeeAdapter()
    const params = withPageSink({ page: 2, limit: 4 })
    expect((await adapter.listOrders(CREDS, params)).map((o) => o.id)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
