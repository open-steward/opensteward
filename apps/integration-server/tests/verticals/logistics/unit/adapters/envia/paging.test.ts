/**
 * Envia list methods, rebuilt onto the documented Queries API
 * (https://queries.envia.com/, Bearer auth):
 *
 * - listOrders: GET /v4/orders, "`limit` | number | `20` | Number of orders
 *   per page." / "`page` | number | `1` | Page number to retrieve.", and
 *   "`totals` ... Total number of matching results for pagination."
 *   https://docs.envia.com/reference/get-orders.md
 * - listShipments: GET /guide/{MM}/{YYYY}, "Retrieves all shipments created
 *   under your account for a specific calendar month and year." No page or
 *   size parameter and no documented retention limit, so the adapter walks
 *   UTC calendar months newest-first back to updatedAfter, and refuses a call
 *   without it. https://docs.envia.com/reference/shipments-by-month-year.md
 * - listCarriers: GET /carrier needs `country_code` ("required": true), which
 *   a connection does not store: refused.
 * - listTrackingEvents: no event collection exists: refused.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { _resetRowPager, listPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { EnviaAdapter } from '../../../../../../src/verticals/logistics/adapters/envia/index'

const CREDS = { accessToken: 'envia_test' }
const CALL_BUDGET = 30

type Get = (path: string, cfg?: { params?: Record<string, unknown> }) => Promise<{ data: unknown }>

function mockHttp(get: Get) {
  const spy = vi.fn(get)
  const post = vi.fn(async () => {
    throw new Error('no POST expected')
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get: spy,
    post,
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get: spy, post }
}

function order(id: number) {
  return {
    id,
    status_id: 4,
    status_name: 'Shipped',
    order: { number: String(id), total_price: 10, currency: 'MXN' },
  }
}

/** A fake GET /v4/orders that honours only `page` and `limit`. */
function fakeOrders(total: number) {
  const all = Array.from({ length: total }, (_, i) => order(i + 1))
  let calls = 0
  return mockHttp(async (path, cfg) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
    if (path !== 'v4/orders') throw new Error(`unexpected path ${path}`)
    const params = cfg?.params ?? {}
    const extra = Object.keys(params).filter((k) => k !== 'page' && k !== 'limit')
    if (extra.length) throw new Error(`undocumented params: ${extra.join(',')}`)
    const limit = Number(params['limit'] ?? 20)
    const page = Number(params['page'] ?? 1)
    const start = (page - 1) * limit
    return {
      data: { orders_info: all.slice(start, start + limit), countries: ['MX'], totals: total },
    }
  })
}

/** A fake GET /guide/{MM}/{YYYY}: whole months, no query parameters honoured. */
function fakeMonths(rowsByMonth: Record<string, number>) {
  let calls = 0
  const paths: string[] = []
  const http = mockHttp(async (path, cfg) => {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded')
    if (cfg?.params && Object.keys(cfg.params).length)
      throw new Error(`undocumented params: ${Object.keys(cfg.params).join(',')}`)
    const m = /^guide\/(\d{2})\/(\d{4})$/.exec(path)
    if (!m) throw new Error(`unexpected path ${path}`)
    paths.push(path)
    const n = rowsByMonth[`${m[2]}-${m[1]}`] ?? 0
    return {
      data: {
        success: true,
        data: Array.from({ length: n }, (_, i) => ({
          tracking_number: `${m[2]}${m[1]}-${i + 1}`,
          carrier: 'fedex',
          status: 'Delivered',
          created_at: `${m[2]}-${m[1]}-01T12:00:00Z`,
        })),
      },
    }
  })
  return { ...http, paths }
}

const adapter = () => new EnviaAdapter()

beforeEach(() => _resetRowPager())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('envia listOrders (GET /v4/orders, page + limit)', () => {
  it('with 2L+1 orders, pages 1..3 return every order once, hasMore exact from totals', async () => {
    const L = 4
    fakeOrders(2 * L + 1)
    const seen: string[] = []
    const hasMore: unknown[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const env = listPage(await adapter().listOrders(CREDS, params), params, 'envia')
      seen.push(...env.data.map((o) => o.id!))
      hasMore.push(env.meta.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => String(i + 1)))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends exactly the caller page and limit to the documented path', async () => {
    const { get } = fakeOrders(50)
    await adapter().listOrders(CREDS, withPageSink({ page: 3, limit: 7 }))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]![0]).toBe('v4/orders')
    expect(get.mock.calls[0]![1]).toEqual({ params: { page: 3, limit: 7 } })
  })

  it('getOrder reads through the documented order_ids filter', async () => {
    const { get } = mockHttp(async (path, cfg) => {
      if (path !== 'v4/orders') throw new Error(`unexpected path ${path}`)
      const id = Number(cfg?.params?.['order_ids'])
      return { data: { orders_info: [order(id)], countries: [], totals: 1 } }
    })
    const o = await adapter().getOrder(CREDS, '58144641')
    expect(o.id).toBe('58144641')
    expect(get.mock.calls[0]![1]).toEqual({ params: { order_ids: '58144641' } })
  })

  it('getOrder is a 404 when the filter matches nothing', async () => {
    mockHttp(async () => ({ data: { orders_info: [], countries: [], totals: 0 } }))
    await expect(adapter().getOrder(CREDS, '1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getOrder never returns a different order than the one asked for', async () => {
    mockHttp(async () => ({ data: { orders_info: [order(2)], countries: [], totals: 1 } }))
    await expect(adapter().getOrder(CREDS, '1')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('envia listShipments (GET /guide/{MM}/{YYYY}, month windows)', () => {
  it('refuses a call without updatedAfter with 501 and sends nothing', async () => {
    const { get } = fakeMonths({})
    await expect(
      adapter().listShipments(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
  })

  it('walks UTC months newest-first to updatedAfter: 2L+1 rows over uneven months, every id once, hasMore exact', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'))
    const L = 4
    // 3 + 0 + 5 + 1 = 9 = 2L+1 rows; November 2023 is outside the window.
    const { paths } = fakeMonths({
      '2024-03': 3,
      '2024-02': 0,
      '2024-01': 5,
      '2023-12': 1,
      '2023-11': 7,
    })
    const updatedAfter = new Date('2023-12-10T00:00:00Z')
    const seen: string[] = []
    const hasMore: unknown[] = []
    for (let page = 1; page <= 3; page++) {
      const params: QueryParams = withPageSink({ page, limit: L, updatedAfter })
      const env = listPage(await adapter().listShipments(CREDS, params), params, 'envia')
      seen.push(...env.data.map((s) => s.id!))
      hasMore.push(env.meta.hasMore)
    }
    expect(seen).toEqual([
      '202403-1',
      '202403-2',
      '202403-3',
      '202401-1',
      '202401-2',
      '202401-3',
      '202401-4',
      '202401-5',
      '202312-1',
    ])
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
    expect(new Set(paths)).toEqual(
      new Set(['guide/03/2024', 'guide/02/2024', 'guide/01/2024', 'guide/12/2023']),
    )
  })

  it('an updatedAfter in the current month reads that one month only', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'))
    const { paths } = fakeMonths({ '2024-03': 2, '2024-02': 4 })
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date('2024-03-01T00:00:00Z'),
    })
    const rows = await adapter().listShipments(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['202403-1', '202403-2'])
    expect(paths).toEqual(['guide/03/2024'])
  })

  it('anchors windows to UTC months, not the host timezone', async () => {
    const tz = process.env['TZ']
    process.env['TZ'] = 'Pacific/Kiritimati' // UTC+14
    try {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2024-03-15T12:00:00Z'))
      const { paths } = fakeMonths({ '2024-03': 1, '2024-02': 1 })
      // 29 Feb in UTC, already 1 March in Kiritimati.
      const updatedAfter = new Date('2024-02-29T12:00:00Z')
      await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: 10, updatedAfter }))
      expect(paths).toEqual(['guide/03/2024', 'guide/02/2024'])
    } finally {
      if (tz === undefined) delete process.env['TZ']
      else process.env['TZ'] = tz
    }
  })

  it('refuses an invalid updatedAfter with 501 and sends nothing', async () => {
    const { get } = fakeMonths({})
    await expect(
      adapter().listShipments(
        CREDS,
        withPageSink({ page: 1, limit: 10, updatedAfter: new Date('not a date') }),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
  })

  it('a narrower window is a new walk, not rows cached from a wider one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'))
    fakeMonths({ '2024-03': 3, '2024-02': 0, '2024-01': 5, '2023-12': 1 })
    const L = 4
    const wide = withPageSink({ page: 1, limit: L, updatedAfter: new Date('2023-12-10T00:00:00Z') })
    await adapter().listShipments(CREDS, wide)
    // March holds 3 rows, so page 2 of a March-only window is empty.
    const narrow = withPageSink({
      page: 2,
      limit: L,
      updatedAfter: new Date('2024-03-01T00:00:00Z'),
    })
    const env = listPage(await adapter().listShipments(CREDS, narrow), narrow, 'envia')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })

  it("never serves one connection's cached shipments to another", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-03-15T12:00:00Z'))
    const updatedAfter = new Date('2024-03-01T00:00:00Z')
    fakeMonths({ '2024-03': 2 })
    // Connection A reads page 1 of 1 row, leaving its second row cached.
    await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: 1, updatedAfter }))
    const { get } = mockHttp(async () => ({
      data: {
        success: true,
        data: [
          { tracking_number: 'other-1', carrier: 'dhl', status: 'Delivered' },
          { tracking_number: 'other-2', carrier: 'dhl', status: 'Delivered' },
        ],
      },
    }))
    const rows = await adapter().listShipments(
      { accessToken: 'another_connection' },
      withPageSink({ page: 2, limit: 1, updatedAfter }),
    )
    expect(get).toHaveBeenCalled()
    expect(rows.map((r) => r.id)).toEqual(['other-2'])
  })

  it('getShipment is a 404 when the response carries no data', async () => {
    mockHttp(async () => ({ data: { success: false } }))
    await expect(adapter().getShipment(CREDS, '1')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getShipment encodes the tracking number as one path segment', async () => {
    const { get } = mockHttp(async () => ({
      data: { data: { tracking_number: 'a/b', carrier: 'fedex', status: 'Delivered' } },
    }))
    await adapter().getShipment(CREDS, 'a/b')
    expect(get.mock.calls[0]![0]).toBe('guide/a%2Fb')
  })

  it('getShipment reads GET /guide/{tracking_number} and unwraps data', async () => {
    const { get } = mockHttp(async (path) => {
      if (path !== 'guide/1234567890') throw new Error(`unexpected path ${path}`)
      return {
        data: {
          success: true,
          data: {
            tracking_number: '1234567890',
            carrier: 'fedex',
            status: 'Shipped',
            created_at: '2024-03-05T10:00:00Z',
            updated_at: '2024-03-06T10:00:00Z',
          },
        },
      }
    })
    const s = await adapter().getShipment(CREDS, '1234567890')
    expect(get).toHaveBeenCalledTimes(1)
    expect(s.id).toBe('1234567890')
    expect(s.carrierId).toBe('fedex')
    expect(s.status).toBe('IN_TRANSIT')
  })
})

describe('envia refusals send no request', () => {
  it('listCarriers refuses with 501 NOT_SUPPORTED (country_code is required)', async () => {
    const { get, post } = mockHttp(async () => ({ data: { data: [] } }))
    const err = await adapter()
      .listCarriers(CREDS, withPageSink({ page: 1, limit: 10 }))
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(String((err as Error).message)).toContain('country_code')
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('listTrackingEvents refuses with 501 NOT_SUPPORTED, naming the documented lookup', async () => {
    const { get, post } = mockHttp(async () => ({ data: { data: [] } }))
    const err = await adapter()
      .listTrackingEvents(CREDS, withPageSink({ page: 1, limit: 10 }))
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    // track-shipments.md: "/ship/generaltrack/" with a "trackingNumbers" array.
    expect(String((err as Error).message)).toContain('POST /ship/generaltrack/')
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('getCarrier reads GET /carrier/{carrier_id} and unwraps data', async () => {
    const { get } = mockHttp(async (path) => {
      if (path !== 'carrier/1') throw new Error(`unexpected path ${path}`)
      return {
        data: {
          success: true,
          data: { id: 1, name: 'fedex', code: 'fedex', active: true, services: [] },
        },
      }
    })
    const c = await adapter().getCarrier(CREDS, '1')
    expect(get).toHaveBeenCalledTimes(1)
    expect(c).toMatchObject({ id: '1', name: 'fedex', code: 'fedex', isActive: true })
  })
})
