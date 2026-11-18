/**
 * GEODIS read methods, against a fake that honours only what the GEODIS
 * Americas WMS API collection documents
 * (https://docs.api.geodis.com/api/collections/23261785/2s8YzUyhAw?segregateAuth=true&versionTag=latest):
 *
 * - host "https://apigw.ams.geodis.com", `Authorization: Bearer <Generated Token>`;
 * - GetShipmentConfirmation `GET /api/ShipmentConfirmation/v1` with CustomerId,
 *   OrderId, pageNumber, pageSize ("Minimum User Setting 100; Maximum User
 *   Setting 1000"), StartDate and EndDate ("YYYY-MM-DD"T"24HH:MI:SS"): "Difference
 *   between dates cannot exceed 96 hours, or beyond 45 days from current date.";
 * - no tracking endpoint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials } from '../../../../../../src/verticals/logistics/adapter/interface'
import { GeodisAdapter } from '../../../../../../src/verticals/logistics/adapters/geodis/index'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import type { GeodisShipmentConfirmationOrder } from '../../../../../../src/verticals/logistics/adapters/geodis/transform/shipment-confirmation'
import { docOrder, docPage } from './fixtures'

// 2026-09-24T10:00:00Z. The 45-day limit reaches back to 2026-08-10T10:00Z, so
// the oldest whole UTC day inside it is 2026-08-11: 45 days, 12 windows.
const NOW = Date.UTC(2026, 8, 24, 10, 0, 0)
const DAY = 86_400_000

type Query = Record<string, unknown>
type Call = { path: string; params: Query }

let calls: Call[]
let created: Array<{ baseURL?: string; headers?: Record<string, unknown> }>
/** Pages per window, keyed by StartDate: window -> pages of orders. */
let windows: Record<string, GeodisShipmentConfirmationOrder[][]>
let credSeq = 0

function creds(extra: Record<string, unknown> = {}): Credentials {
  credSeq += 1
  return {
    accessToken: `tok-${credSeq}`,
    expiresAt: new Date(NOW + 300_000),
    extra: {
      username: `user-${credSeq}-${Math.random()}`,
      password: 'pw',
      customerId: '12345',
      ...extra,
    },
  }
}

const ALLOWED = ['CustomerId', 'OrderId', 'pageNumber', 'pageSize', 'StartDate', 'EndDate']
const WMS_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

/** The documented contract: every refusal the docs describe is a thrown error here. */
function shipmentConfirmation(params: Query): unknown {
  for (const k of Object.keys(params))
    if (!ALLOWED.includes(k)) throw new Error(`undocumented ${k}`)
  if (params['CustomerId'] !== '12345') throw new Error('CustomerId is mandatory')
  const start = String(params['StartDate'])
  const end = String(params['EndDate'])
  if (!WMS_DATE.test(start) || !WMS_DATE.test(end))
    throw new Error('dates must be YYYY-MM-DDTHH:MM:SS')
  const s = Date.parse(`${start}Z`)
  const e = Date.parse(`${end}Z`)
  if (e < s || e - s > 96 * 3600_000)
    throw new Error('Difference between dates cannot exceed 96 hours')
  if (s < NOW - 45 * DAY) throw new Error('beyond 45 days from current date')
  const size = Number(params['pageSize'])
  if (!(size >= 100 && size <= 1000)) throw new Error('pageSize must be 100..1000')
  const page = Number(params['pageNumber'])
  const pages = windows[start] ?? [[]]
  const rows = pages[page - 1] ?? []
  return docPage(rows, page, page >= pages.length)
}

beforeEach(() => {
  calls = []
  created = []
  windows = {}
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.spyOn(axios, 'create').mockImplementation((cfg) => {
    created.push({ baseURL: cfg?.baseURL, headers: cfg?.headers as Record<string, unknown> })
    return {
      get: vi.fn(async (path: string, opts?: { params?: Query }) => {
        const params = opts?.params ?? {}
        calls.push({ path, params })
        if (path !== 'api/ShipmentConfirmation/v1') throw new Error(`undocumented path ${path}`)
        return { data: shipmentConfirmation(params) }
      }),
      post: vi.fn(async () => {
        throw new Error('no POST expected')
      }),
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('geodis listOrders', () => {
  it('sends the documented request on the documented host with a bearer token', async () => {
    const c = creds()
    await new GeodisAdapter().listOrders(c, withPageSink({ page: 1, limit: 10 }))
    expect(created[0]!.baseURL).toBe('https://apigw.ams.geodis.com/')
    expect(created[0]!.headers?.['Authorization']).toBe(`Bearer ${c.accessToken}`)
    expect(created[0]!.headers).not.toHaveProperty('X-API-Key')
    expect(calls[0]).toEqual({
      path: 'api/ShipmentConfirmation/v1',
      params: {
        CustomerId: '12345',
        StartDate: '2026-09-21T00:00:00',
        EndDate: '2026-09-24T23:59:59',
        pageNumber: 1,
        pageSize: 1000,
      },
    })
  })

  it('serves an unfiltered call over 96-hour windows back to the 45-day limit, newest first', async () => {
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await new GeodisAdapter().listOrders(creds(), params)).toEqual([])
    expect(calls).toHaveLength(12)
    expect(calls.map((c) => [c.params['StartDate'], c.params['EndDate']])).toEqual([
      ['2026-09-21T00:00:00', '2026-09-24T23:59:59'],
      ['2026-09-17T00:00:00', '2026-09-20T23:59:59'],
      ['2026-09-13T00:00:00', '2026-09-16T23:59:59'],
      ['2026-09-09T00:00:00', '2026-09-12T23:59:59'],
      ['2026-09-05T00:00:00', '2026-09-08T23:59:59'],
      ['2026-09-01T00:00:00', '2026-09-04T23:59:59'],
      ['2026-08-28T00:00:00', '2026-08-31T23:59:59'],
      ['2026-08-24T00:00:00', '2026-08-27T23:59:59'],
      ['2026-08-20T00:00:00', '2026-08-23T23:59:59'],
      ['2026-08-16T00:00:00', '2026-08-19T23:59:59'],
      ['2026-08-12T00:00:00', '2026-08-15T23:59:59'],
      ['2026-08-11T00:00:00', '2026-08-11T23:59:59'],
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('walks N = 2L+1 orders over uneven pages and windows: every id once, hasMore exact', async () => {
    // Window 1: two upstream pages of 2 and 1 rows; window 2 empty; window 3: 2 rows.
    windows['2026-09-21T00:00:00'] = [[docOrder('a'), docOrder('b')], [docOrder('c')]]
    windows['2026-09-13T00:00:00'] = [[docOrder('d'), docOrder('e')]]
    const adapter = new GeodisAdapter()
    const c = creds()
    const L = 2
    const seen: string[] = []
    const more: boolean[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const got = await adapter.listOrders(c, params)
      for (const o of got) OrderSchema.parse(o)
      seen.push(...got.map((o) => o.id!))
      more.push(readUpstreamPage(params)!.hasMore!)
    }
    expect(seen).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(more).toEqual([true, true, false])
    // pageNumber moves within a window, then restarts at 1 in the next.
    expect(calls.slice(0, 4).map((x) => [x.params['StartDate'], x.params['pageNumber']])).toEqual([
      ['2026-09-21T00:00:00', 1],
      ['2026-09-21T00:00:00', 2],
      ['2026-09-17T00:00:00', 1],
      ['2026-09-13T00:00:00', 1],
    ])
  })

  it('bounds the walk by the day of updatedAfter', async () => {
    windows['2026-09-19T00:00:00'] = [[docOrder('old')]]
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date(Date.UTC(2026, 8, 19, 15)),
    })
    const got = await new GeodisAdapter().listOrders(creds(), params)
    expect(got.map((o) => o.id)).toEqual(['old'])
    expect(calls.map((c) => [c.params['StartDate'], c.params['EndDate']])).toEqual([
      ['2026-09-21T00:00:00', '2026-09-24T23:59:59'],
      ['2026-09-19T00:00:00', '2026-09-20T23:59:59'],
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('clamps an updatedAfter older than the documented 45 days to the limit', async () => {
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date(Date.UTC(2026, 0, 1)),
    })
    await new GeodisAdapter().listOrders(creds(), params)
    expect(calls).toHaveLength(12)
    expect(calls.at(-1)!.params['StartDate']).toBe('2026-08-11T00:00:00')
  })

  it('answers an updatedAfter in the future with nothing, sending nothing', async () => {
    const params = withPageSink({ page: 1, limit: 10, updatedAfter: new Date(NOW + 2 * DAY) })
    expect(await new GeodisAdapter().listOrders(creds(), params)).toEqual([])
    expect(calls).toHaveLength(0)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it("restarts the walk when a caller's next page lands after UTC midnight", async () => {
    // Window cursors are relative to today's UTC day, so marks from before
    // midnight must not be replayed against the shifted windows.
    const before = Date.UTC(2026, 8, 24, 23, 59, 50)
    const after = Date.UTC(2026, 8, 25, 0, 0, 10)
    vi.setSystemTime(before)
    windows['2026-09-21T00:00:00'] = [[docOrder('a'), docOrder('b')], [docOrder('c')]]
    const adapter = new GeodisAdapter()
    const c = { ...creds(), expiresAt: new Date(after + 300_000) }
    const p1 = await adapter.listOrders(c, withPageSink({ page: 1, limit: 2 }))
    expect(p1.map((o) => o.id)).toEqual(['a', 'b'])
    vi.setSystemTime(after)
    windows = {
      '2026-09-22T00:00:00': [
        [docOrder('n'), docOrder('a')],
        [docOrder('b'), docOrder('c')],
      ],
    }
    const sent = calls.length
    const p2 = await adapter.listOrders(c, withPageSink({ page: 2, limit: 2 }))
    expect(calls[sent]!.params).toMatchObject({ StartDate: '2026-09-22T00:00:00', pageNumber: 1 })
    expect(p2.map((o) => o.id)).toEqual(['b', 'c'])
  })

  it('mints a new token before listing when the stored one is about to expire', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'fresh', expires_in: 300 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const c = { ...creds(), expiresAt: new Date(NOW + 5_000) }
    await new GeodisAdapter().listOrders(c, withPageSink({ page: 1, limit: 10 }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'https://auth.ams.geodis.com/realms/sso/protocol/openid-connect/token',
    )
    expect(created[0]!.headers?.['Authorization']).toBe('Bearer fresh')
  })

  it('refuses a connection without a Customer ID with 501 NOT_SUPPORTED, sending nothing', async () => {
    await expect(
      new GeodisAdapter().listOrders(
        creds({ customerId: undefined }),
        withPageSink({ page: 1, limit: 10 }),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
    expect(created).toHaveLength(0)
  })

  it('refuses to guess the end of a page that carries orders but no pagedResponse', async () => {
    const adapter = new GeodisAdapter()
    vi.mocked(axios.create).mockImplementation(
      () =>
        ({
          get: vi.fn(async () => ({ data: { response: { order: [docOrder('x')] } } })),
        }) as unknown as ReturnType<typeof axios.create>,
    )
    await expect(adapter.listOrders(creds(), withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(
      /pagedResponse/,
    )
  })
})

describe('geodis tracking events', () => {
  it('listTrackingEvents refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(
      new GeodisAdapter().listTrackingEvents(
        creds(),
        withPageSink({ page: 1, limit: 10, trackingNumber: 'T1' }),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
    expect(created).toHaveLength(0)
  })

  it('getTrackingEvents refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(new GeodisAdapter().getTrackingEvents(creds(), 'T1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
    expect(created).toHaveLength(0)
  })
})
