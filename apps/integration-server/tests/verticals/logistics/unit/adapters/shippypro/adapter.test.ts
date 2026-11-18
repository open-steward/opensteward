/**
 * ShippyPro read methods against the documented v1 API.
 *
 * First-party source: https://api.shippypro.com/docs/v1.json
 *   - "This is the endpoint to reach: https://api.shippypro.com/v1"; each
 *     method is its own path, `POST /v1/<Method>`.
 *   - "you need to send a well-formed JSON POST request containing Method and
 *     Params parameters"; every body is `"required":["Method","Params"]`.
 *   - "`Authorization: Bearer your-API-Key`"
 *   - GetCarriersParams: "All fields are optional; send an empty object to list
 *     every carrier." (fields `Active`, `Credentials`; no paging).
 *   - GetShipmentsReportParams: `"required":["DateMin","DateMax"]`, plus
 *     `Return`, `IncludeItems`, `ShowHiddenShipments`; no paging.
 *   - GetOrderParams / GetLabelUrlParams: "OrderID" integer; GetTrackingParams: "Code".
 *
 * The fake answers only documented methods and params; anything else is a 400.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { _resetRowPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ShippyProAdapter } from '../../../../../../src/verticals/logistics/adapters/shippypro/index'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { CarrierSchema } from '../../../../../../src/verticals/logistics/schema/carrier'

const CREDS = { accessToken: 'key-a' }
const L = 5
const N = 2 * L + 1
const DAY = 86_400
/** A fixed "now": 2026-09-24T15:00:00Z. Today's UTC day starts at TODAY. */
const NOW = Date.UTC(2026, 8, 24, 15, 0, 0)
const TODAY = Date.UTC(2026, 8, 24) / 1000

const DOCUMENTED_PARAMS: Record<string, string[]> = {
  GetCarriers: ['Active', 'Credentials'],
  GetShipmentsReport: ['DateMin', 'DateMax', 'Return', 'IncludeItems', 'ShowHiddenShipments'],
  GetOrder: ['OrderID'],
  GetLabelUrl: [
    'OrderID',
    'LabelType',
    'LabelWidth',
    'LabelHeight',
    'Rotate',
    'PageNumber',
    'SplitPages',
  ],
  GetTracking: ['Code'],
}
const REQUIRED_PARAMS: Record<string, string[]> = {
  GetShipmentsReport: ['DateMin', 'DateMax'],
  GetOrder: ['OrderID'],
  GetLabelUrl: ['OrderID'],
  GetTracking: ['Code'],
}

type Call = { baseURL?: string; auth?: string; path: string; body: Record<string, unknown> }

/** A report row per shipment, dated at a Unix second. */
type Dated = { id: string; at: number }

function fakeShippyPro(
  opts: {
    shipments?: Dated[]
    carriers?: Record<string, Array<Record<string, unknown>>>
    answers?: Record<string, unknown>
  } = {},
) {
  const calls: Call[] = []
  const create = vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL?: string
    headers?: Record<string, string>
  }) => ({
    post: vi.fn(async (path: string, body: Record<string, unknown>) => {
      calls.push({ baseURL: cfg.baseURL, auth: cfg.headers?.Authorization, path, body })
      const method = String(body['Method'])
      if (path !== `/${method}`) throw new Error(`400: path ${path} is not /${method}`)
      const allowed = DOCUMENTED_PARAMS[method]
      if (!allowed) throw new Error(`404: undocumented method ${method}`)
      const params = body['Params'] as Record<string, unknown> | undefined
      if (!params || typeof params !== 'object') throw new Error('400: Params is required')
      const bad = Object.keys(body).filter((k) => k !== 'Method' && k !== 'Params')
      bad.push(...Object.keys(params).filter((k) => !allowed.includes(k)))
      if (bad.length) throw new Error(`400: undocumented ${bad.join(',')}`)
      const missing = (REQUIRED_PARAMS[method] ?? []).filter((k) => params[k] === undefined)
      if (missing.length) throw new Error(`400: missing ${missing.join(',')}`)
      if (method === 'GetCarriers') return { data: { Carriers: opts.carriers ?? {} } }
      if (method === 'GetShipmentsReport') {
        const min = Number(params['DateMin'])
        const max = Number(params['DateMax'])
        if (!(max >= min)) throw new Error('400: DateMax before DateMin')
        const rows = (opts.shipments ?? [])
          .filter((s) => s.at >= min && s.at <= max)
          .map((s) => ({ OrderID: s.id, Date: String(s.at), TransactionID: `T${s.id}` }))
        return { data: { Shipments: rows } }
      }
      return { data: opts.answers?.[method] ?? {} }
    }),
  })) as never)
  return { calls, create }
}

const adapter = () => new ShippyProAdapter()
const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

beforeEach(() => {
  _resetRowPager()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('shippypro client', () => {
  it('POSTs {Method, Params} to https://api.shippypro.com/v1/<Method> with a Bearer API key', async () => {
    const { calls } = fakeShippyPro()
    await adapter().listCarriers(CREDS, withPageSink({ page: 1, limit: L }))
    expect(calls).toEqual([
      {
        baseURL: 'https://api.shippypro.com/v1',
        auth: 'Bearer key-a',
        path: '/GetCarriers',
        body: { Method: 'GetCarriers', Params: {} },
      },
    ])
  })
})

describe('shippypro listCarriers (GetCarriers, unpaginated → pageLocally)', () => {
  // Connections spread unevenly over carrier names; ids 1..N in response order.
  const carriers = {
    UPS: ids(3).map((id) => ({ CarrierID: id, Label: 'UPS', ServicesList: ['Ground'] })),
    DHLExpress: ['4', '5', '6', '7', '8', '9', '10'].map((id) => ({ CarrierID: id })),
    GLS: [{ CarrierID: '11' }],
  }

  it('N = 2L+1 connections: pages 1..3 at limit L return every id once with exact hasMore', async () => {
    const { calls } = fakeShippyPro({ carriers })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    const totals: Array<number | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter().listCarriers(CREDS, params)
      rows.forEach((r) => CarrierSchema.parse(r))
      seen.push(...rows.map((r) => r.id ?? '<none>'))
      more.push(readUpstreamPage(params)?.hasMore)
      totals.push(readUpstreamPage(params)?.totalCount)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
    expect(totals).toEqual([N, N, N])
    expect(calls.every((c) => JSON.stringify(c.body.Params) === '{}')).toBe(true)
  })
})

describe('shippypro listShipments (GetShipmentsReport, DATE-WINDOW)', () => {
  it('refuses a call without updatedAfter with 501 NOT_SUPPORTED, sending nothing', async () => {
    const { calls, create } = fakeShippyPro()
    await expect(
      adapter().listShipments(CREDS, withPageSink({ page: 1, limit: L })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining('DateMin'),
    })
    expect(calls).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })

  // N rows over 5 UTC days, uneven (today 2, -1 none, -2 6, -3 1, -4 2), plus
  // one row before the lower bound that must never be served.
  const at = (daysAgo: number, second: number) => TODAY - daysAgo * DAY + second
  const shipments: Dated[] = [
    { id: '1', at: at(0, 100) },
    { id: '2', at: at(0, 50) },
    ...['3', '4', '5', '6', '7', '8'].map((id, i) => ({ id, at: at(2, DAY - 1 - i) })),
    { id: '9', at: at(3, 0) },
    { id: '10', at: at(4, 7200) },
    { id: '11', at: at(4, 3600) },
    { id: 'too-old', at: at(4, 3599) },
    { id: 'older', at: at(9, 0) },
  ]
  const after = new Date(at(4, 3600) * 1000)

  it('walks UTC days newest-first down to updatedAfter: pages 1..3 at limit L serve every id once, hasMore exact', async () => {
    const { calls } = fakeShippyPro({ shipments })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L, updatedAfter: after })
      const rows = await adapter().listShipments(CREDS, params)
      rows.forEach((r) => ShipmentSchema.parse(r))
      seen.push(...rows.map((r) => r.id ?? '<none>'))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(N))
    expect(more).toEqual([true, true, false])
    // Every window is one UTC calendar day, newest first; the last is clipped
    // to the updatedAfter second. No window reaches below it.
    const windows = [...new Set(calls.map((c) => JSON.stringify(c.body.Params)))].map(
      (p) => JSON.parse(p) as { DateMin: number; DateMax: number },
    )
    expect(windows).toEqual([
      { DateMin: at(0, 0), DateMax: at(0, DAY - 1) },
      { DateMin: at(1, 0), DateMax: at(1, DAY - 1) },
      { DateMin: at(2, 0), DateMax: at(2, DAY - 1) },
      { DateMin: at(3, 0), DateMax: at(3, DAY - 1) },
      { DateMin: at(4, 3600), DateMax: at(4, DAY - 1) },
    ])
  })

  it('a sequential walk costs one request per window', async () => {
    const { calls } = fakeShippyPro({ shipments })
    for (let page = 1; page <= 3; page++) {
      await adapter().listShipments(CREDS, withPageSink({ page, limit: L, updatedAfter: after }))
    }
    expect(calls).toHaveLength(5)
  })

  it('keeps each connection its own walk: page 2 on another API key never continues the first key walk', async () => {
    // Key A's walk: page 1 stops inside day -2 and keeps that window's rows.
    fakeShippyPro({ shipments })
    await adapter().listShipments(CREDS, withPageSink({ page: 1, limit: L, updatedAfter: after }))
    vi.restoreAllMocks()

    // Key B's account has its own shipments on the same days.
    const theirs = shipments.map((s) => ({ ...s, id: `b${s.id}` }))
    const { calls } = fakeShippyPro({ shipments: theirs })
    const rows = await adapter().listShipments(
      { accessToken: 'key-b' },
      withPageSink({ page: 2, limit: L, updatedAfter: after }),
    )
    expect(rows.map((r) => r.id)).toEqual(['b6', 'b7', 'b8', 'b9', 'b10'])
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((c) => c.auth === 'Bearer key-b')).toBe(true)
  })

  it('a walk that crosses a UTC midnight restarts on the new day windows instead of mixing two walks', async () => {
    // One row lands on the next UTC day; the page-1 walk cannot see it yet.
    const withTomorrow: Dated[] = [{ id: 'n1', at: TODAY + DAY + 5 }, ...shipments]
    const { calls } = fakeShippyPro({ shipments: withTomorrow })
    // Page 1 at 23:59:50Z, page 2 twenty seconds later, inside the row pager's cache lifetime.
    vi.setSystemTime((TODAY + DAY - 10) * 1000)
    const first = await adapter().listShipments(
      CREDS,
      withPageSink({ page: 1, limit: L, updatedAfter: after }),
    )
    expect(first.map((r) => r.id)).toEqual(ids(L))

    vi.setSystemTime((TODAY + DAY + 10) * 1000)
    calls.length = 0
    const params = withPageSink({ page: 2, limit: L, updatedAfter: after })
    const second = await adapter().listShipments(CREDS, params)
    // The new day's stream is n1, 1..11: its page 2 is rows 5..9.
    expect(second.map((r) => r.id)).toEqual(['5', '6', '7', '8', '9'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(calls[0]?.body.Params).toEqual({ DateMin: TODAY + DAY, DateMax: TODAY + 2 * DAY - 1 })
  })

  it('an updatedAfter in the future sends nothing and serves nothing', async () => {
    const { calls } = fakeShippyPro({ shipments })
    const params = withPageSink({ page: 1, limit: L, updatedAfter: new Date(NOW + 3 * DAY * 1000) })
    expect(await adapter().listShipments(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toEqual([])
  })
})

describe.each([
  [
    'listTrackingEvents',
    (a: ShippyProAdapter) => a.listTrackingEvents(CREDS, withPageSink({ page: 1, limit: L })),
    'GetTracking',
  ],
  [
    'listManifests',
    (a: ShippyProAdapter) => a.listManifests(CREDS, withPageSink({ page: 1, limit: L })),
    'ManifestNumber',
  ],
  [
    'listWarehouses',
    (a: ShippyProAdapter) => a.listWarehouses(CREDS, withPageSink({ page: 1, limit: L })),
    'warehouse',
  ],
] as const)('shippypro %s', (_name, call, quoted) => {
  it('throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { calls, create } = fakeShippyPro()
    await expect(call(adapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringContaining(quoted),
    })
    expect(calls).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })
})

describe('shippypro single-record reads', () => {
  const ORDER = {
    Result: 'OK',
    OrderID: '612648',
    TransactionID: '1234',
    CarrierID: '3',
    TrackingNumber: '8599848451',
    Status: '2',
    LabelURL: ['https://cdn.shippypro.com/labels/label.pdf'],
  }

  it('getShipment sends GetOrder {OrderID: <integer>} and reads the documented fields', async () => {
    const { calls } = fakeShippyPro({ answers: { GetOrder: ORDER } })
    const s = ShipmentSchema.parse(await adapter().getShipment(CREDS, '612648'))
    expect(calls.map((c) => c.body)).toEqual([{ Method: 'GetOrder', Params: { OrderID: 612648 } }])
    expect(s).toMatchObject({ id: '612648', carrierId: '3', status: 'IN_TRANSIT' })
  })

  it('getOrder reads the same GetOrder record', async () => {
    const { calls } = fakeShippyPro({ answers: { GetOrder: ORDER } })
    const o = await adapter().getOrder(CREDS, '612648')
    expect(calls.map((c) => c.path)).toEqual(['/GetOrder'])
    expect(o).toMatchObject({ id: '612648', orderNumber: '1234', shipmentIds: ['612648'] })
  })

  it('a non-integer order id is a 400 before any request', async () => {
    const { calls } = fakeShippyPro()
    await expect(adapter().getShipment(CREDS, 'ord-1')).rejects.toMatchObject({ statusCode: 400 })
    await expect(adapter().getLabel(CREDS, 'ord-1')).rejects.toMatchObject({ statusCode: 400 })
    expect(calls).toEqual([])
  })

  it('a GetOrder answer without an OrderID throws instead of returning an id-less record', async () => {
    fakeShippyPro({ answers: { GetOrder: { Result: 'KO', ErrorMessage: 'Error123' } } })
    await expect(adapter().getShipment(CREDS, '1')).rejects.toThrow('Error123')
  })

  it('getTrackingEvents sends GetTracking {Code}', async () => {
    const { calls } = fakeShippyPro({
      answers: {
        GetTracking: {
          Carrier: 'UPS',
          Details: [{ date: '1489659960', message: 'DELIVERED', StatusCode: 6 }],
        },
      },
    })
    const events = await adapter().getTrackingEvents(CREDS, '1ZA103756899507566')
    expect(calls.map((c) => c.body)).toEqual([
      { Method: 'GetTracking', Params: { Code: '1ZA103756899507566' } },
    ])
    expect(events.map((e) => [e.trackingNumber, e.status])).toEqual([
      ['1ZA103756899507566', 'DELIVERED'],
    ])
  })

  it('getLabel sends GetLabelUrl {OrderID} and throws when the order has no label', async () => {
    const { calls } = fakeShippyPro({
      answers: {
        GetLabelUrl: {
          LabelURL: 'https://cdn.shippypro.com/labels/label.pdf',
          TrackingNumber: '123456',
        },
      },
    })
    const label = await adapter().getLabel(CREDS, '1234')
    expect(calls.map((c) => c.body)).toEqual([{ Method: 'GetLabelUrl', Params: { OrderID: 1234 } }])
    expect(label).toMatchObject({ id: '1234', url: 'https://cdn.shippypro.com/labels/label.pdf' })

    vi.restoreAllMocks()
    fakeShippyPro({ answers: { GetLabelUrl: { LabelURL: [] } } })
    await expect(adapter().getLabel(CREDS, '1234')).rejects.toThrow('No label')
  })
})
