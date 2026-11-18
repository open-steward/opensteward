/**
 * Coupang lists orders only as order sheets inside a date window:
 * GET /v2/providers/openapi/apis/api/v5/vendors/{vendorId}/ordersheets takes
 * `createdAtFrom*` and `createdAtTo*` ("yyyy-mm-dd%2B0X:00", "You can query up
 * to 31 days"), `status*` (ACCEPT, INSTRUCT, DEPARTURE, DELIVERING,
 * FINAL_DELIVERY, NONE_TRACKING), `maxPerPage` ("You can request up to 50 per
 * page") and `nextToken`, which "will return null if the current page is the
 * last page" (https://developers.coupang.com/en/api/shipments/po-list-query-paging-by-day).
 *
 * The fake honours only those parameters and rejects a window of 31 days or
 * more, as the documented error "endTime-startTime range should less than31."
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { CoupangAdapter } from '../../../../../../src/verticals/ecommerce/adapters/coupang/index'
import { OrderSchema } from '../../../../../../src/verticals/ecommerce/schema/order'
import { CREDS, fakeCoupang, offsetOf, tokenFor } from './fake'
import { orderSheetExample } from './fixtures'

const LIST = /^\/v2\/providers\/openapi\/apis\/api\/v5\/vendors\/A00012345\/ordersheets$/
const STATUSES = [
  'ACCEPT',
  'INSTRUCT',
  'DEPARTURE',
  'DELIVERING',
  'FINAL_DELIVERY',
  'NONE_TRACKING',
]
const DAY = /^(\d{4}-\d{2}-\d{2})\+09:00$/

interface Sheet {
  id: string
  day: string
  status: string
}

function sheets(prefix: string, n: number, day: string, status: string): Sheet[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}`, day, status }))
}

function ordersheetHandler(all: Sheet[]) {
  return (params: Record<string, unknown>) => {
    for (const k of Object.keys(params)) {
      if (!['createdAtFrom', 'createdAtTo', 'status', 'maxPerPage', 'nextToken'].includes(k))
        throw new Error(`undocumented parameter ${k}`)
    }
    const from = DAY.exec(String(params['createdAtFrom']))?.[1]
    const to = DAY.exec(String(params['createdAtTo']))?.[1]
    if (!from || !to) throw new Error('createdAtFrom/createdAtTo must be yyyy-mm-dd+09:00')
    const span = (Date.parse(to) - Date.parse(from)) / 86_400_000
    if (span < 0 || span >= 31) throw new Error('endTime-startTime range should less than31.')
    const status = String(params['status'])
    if (!STATUSES.includes(status)) throw new Error(`status is required (got ${status})`)
    const size = params['maxPerPage'] === undefined ? 50 : Number(params['maxPerPage'])
    if (size > 50) throw new Error('You can request up to 50 per page')
    const match = all.filter((s) => s.status === status && s.day >= from && s.day <= to)
    const start = params['nextToken'] === undefined ? 0 : offsetOf(params['nextToken'])
    const end = Math.min(start + size, match.length)
    return {
      code: 200,
      message: 'OK',
      data: match.slice(start, end).map((s) => ({
        ...orderSheetExample(),
        shipmentBoxId: s.id,
        orderedAt: `${s.day}T10:00:00.000000+09:00`,
        status: s.status,
      })),
      nextToken: end < match.length ? tokenFor(end) : null,
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  // 2025-03-10 12:00 in Korea.
  vi.setSystemTime(new Date('2025-03-10T03:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  _resetCursorPager()
})

// Market-day blocks of 31 days from the epoch: 2025-03-03..2025-04-02 holds
// "today" (2025-03-10), and 2025-01-31..2025-03-02 is the block before it.
const DATA: Sheet[] = [
  ...sheets('a', 55, '2025-03-05', 'ACCEPT'), // two upstream pages: 50 + 5
  ...sheets('d', 2, '2025-03-03', 'DEPARTURE'),
  ...sheets('f', 4, '2025-02-25', 'FINAL_DELIVERY'),
  ...sheets('old', 3, '2025-02-10', 'ACCEPT'), // before updatedAfter
]
const UPDATED_AFTER = new Date('2025-02-20T00:00:00Z')
const EXPECTED = [...sheets('a', 55, '', '').map((s) => s.id), 'd1', 'd2', 'f1', 'f2', 'f3', 'f4']

describe('Coupang listOrders', () => {
  it('refuses an unfiltered call with 501 NOT_SUPPORTED and sends nothing', async () => {
    const calls = fakeCoupang([[LIST, ordersheetHandler(DATA)]])
    await expect(
      new CoupangAdapter().listOrders(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
  })

  it('walks 2L+1 order sheets newest window first, each once, hasMore exact', async () => {
    const calls = fakeCoupang([[LIST, ordersheetHandler(DATA)]])
    const adapter = new CoupangAdapter()
    const ids: string[] = []
    const sizes: number[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 30, updatedAfter: UPDATED_AFTER })
      const rows = await adapter.listOrders(CREDS, params)
      for (const r of rows) OrderSchema.parse(r)
      ids.push(...rows.map((r) => r.id))
      sizes.push(rows.length)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(EXPECTED)
    expect(new Set(ids).size).toBe(ids.length)
    expect(sizes).toEqual([30, 30, 1])
    expect(hasMore).toEqual([true, true, false])
    // Every documented status in each window, the newest window first; no
    // window reaches before updatedAfter's market day.
    const windows = calls.map(
      (c) => `${String(c.params['createdAtFrom'])}..${String(c.params['createdAtTo'])}`,
    )
    expect([...new Set(windows)]).toEqual([
      '2025-03-03+09:00..2025-03-10+09:00',
      '2025-02-20+09:00..2025-03-02+09:00',
    ])
    for (const w of new Set(windows)) {
      const statuses = calls.filter((c, i) => windows[i] === w).map((c) => c.params['status'])
      expect([...new Set(statuses)]).toEqual(STATUSES)
    }
  })

  it('sends the documented parameters, and the nextToken only after page 1', async () => {
    const calls = fakeCoupang([[LIST, ordersheetHandler(DATA)]])
    await new CoupangAdapter().listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 60, updatedAfter: UPDATED_AFTER }),
    )
    expect(calls[0]!.params).toEqual({
      createdAtFrom: '2025-03-03+09:00',
      createdAtTo: '2025-03-10+09:00',
      status: 'ACCEPT',
      maxPerPage: 50,
    })
    expect(calls[1]!.params).toEqual({ ...calls[0]!.params, nextToken: tokenFor(50) })
    expect(calls[2]!.params).toMatchObject({ status: 'INSTRUCT' })
    expect(calls[2]!.params['nextToken']).toBeUndefined()
  })

  it('a cold page 2 walks from the start instead of repeating page 1', async () => {
    fakeCoupang([[LIST, ordersheetHandler(DATA)]])
    const params = withPageSink({ page: 2, limit: 30, updatedAfter: UPDATED_AFTER })
    const rows = await new CoupangAdapter().listOrders(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(EXPECTED.slice(30, 60))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('an updatedAfter in the future lists nothing without a request', async () => {
    const calls = fakeCoupang([[LIST, ordersheetHandler(DATA)]])
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2025-04-01T00:00:00Z'),
    })
    expect(await new CoupangAdapter().listOrders(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('Coupang getOrder', () => {
  it('reads one order sheet by the shipmentBoxId listOrders returns', async () => {
    const calls = fakeCoupang([
      [/\/ordersheets\/\d+$/, () => ({ code: 200, message: 'OK', data: orderSheetExample() })],
    ])
    const order = OrderSchema.parse(
      await new CoupangAdapter().getOrder(CREDS, '642538970006401429'),
    )
    expect(order.id).toBe('642538970006401429')
    expect(calls).toEqual([
      {
        path: '/v2/providers/openapi/apis/api/v5/vendors/A00012345/ordersheets/642538970006401429',
        params: {},
      },
    ])
  })

  it('is a 404 when the order sheet is absent', async () => {
    fakeCoupang([[/\/ordersheets\/\d+$/, () => ({ code: 200, message: 'OK', data: null })]])
    await expect(new CoupangAdapter().getOrder(CREDS, '1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('Coupang cancelOrder', () => {
  it('refuses with 501 NOT_SUPPORTED and sends nothing, instead of reporting a cancel that never happened', async () => {
    const calls = fakeCoupang([
      [/./, () => ({ code: 200, message: 'OK', data: orderSheetExample() })],
    ])
    await expect(
      new CoupangAdapter().cancelOrder(CREDS, '642538970006401429', { reason: 'x' }),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
  })
})

describe('Coupang customers', () => {
  it('listCustomers and getCustomer refuse with 501 NOT_SUPPORTED and send nothing', async () => {
    const calls = fakeCoupang([[/./, () => ({})]])
    const adapter = new CoupangAdapter()
    await expect(
      adapter.listCustomers(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    await expect(adapter.getCustomer(CREDS, 'x')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
  })
})

describe('Coupang fulfillments', () => {
  const GET = /^\/v2\/providers\/openapi\/apis\/api\/v5\/vendors\/A00012345\/ordersheets\/\d+$/

  it('listFulfillments refuses with 501 and sends nothing, with or without an orderId', async () => {
    const calls = fakeCoupang([[GET, () => ({ code: 200, data: orderSheetExample() })]])
    const adapter = new CoupangAdapter()
    await expect(
      adapter.listFulfillments(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    await expect(
      adapter.listFulfillments(
        CREDS,
        withPageSink({ page: 1, limit: 10, orderId: '642538970006401429' }),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
  })

  it('getFulfillment of an order sheet that has not shipped is a 404', async () => {
    fakeCoupang([
      [GET, () => ({ code: 200, data: { ...orderSheetExample(), status: 'INSTRUCT' } })],
    ])
    await expect(new CoupangAdapter().getFulfillment(CREDS, '1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('getFulfillment reads a shipped box by its shipmentBoxId', async () => {
    const calls = fakeCoupang([[GET, () => ({ code: 200, data: orderSheetExample() })]])
    const f = await new CoupangAdapter().getFulfillment(CREDS, '642538970006401429')
    expect(f.id).toBe('642538970006401429')
    expect(f.trackingNumber).toBe('340010913442')
    expect(calls.map((c) => c.path)).toEqual([
      '/v2/providers/openapi/apis/api/v5/vendors/A00012345/ordersheets/642538970006401429',
    ])
  })
})
