/**
 * Frenet reads against the routes the vendor documents at
 * https://docs.frenet.com.br/reference (one OpenAPI definition per page,
 * index at https://docs.frenet.com.br/llms.txt):
 *
 *   GET  https://whitelabel.frenet.com.br/v1/shipments?page&per_page      getShipmentsAsync
 *   GET  https://whitelabel.frenet.com.br/v1/shipments/{shipmentId}        getShipmentAsync
 *   GET  https://whitelabel.frenet.com.br/v1/shipments/{shipmentId}/label  getShipmentLabelAsync
 *   GET  https://whitelabel.frenet.com.br/v1/orders?page&per_page         getOrdersAsync
 *   GET  https://whitelabel.frenet.com.br/v1/orders/{shipmentId}           getOrderAsync
 *   POST https://api.frenet.com.br/tracking/trackinginfo                   trackOrder
 *
 * WhiteLabel routes need `token` and `x-partner-token`; trackinginfo needs
 * `token`. Nothing lists tracking events.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { FrenetAdapter } from '../../../../../../src/verticals/logistics/adapters/frenet/index'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { LabelSchema } from '../../../../../../src/verticals/logistics/schema/label'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'

const CREDS = { accessToken: 'client-token' }
const PARTNER = 'partner-token'

const get = vi.fn()
const post = vi.fn()
const create = vi.fn()

beforeEach(() => {
  create.mockReturnValue({ get, post } as unknown as ReturnType<typeof axios.create>)
  vi.spyOn(axios, 'create').mockImplementation(create)
})

afterEach(() => {
  vi.restoreAllMocks()
  get.mockReset()
  post.mockReset()
  create.mockReset()
})

function expectNoRequest() {
  expect(get).not.toHaveBeenCalled()
  expect(post).not.toHaveBeenCalled()
}

async function rejection(p: Promise<unknown>) {
  return p.then(
    () => {
      throw new Error('resolved')
    },
    (e: unknown) => e as Error & { statusCode?: number; code?: string },
  )
}

/** A documented ShipmentResponse row (example shape, camelCase) with a given id. */
function row(id: number) {
  return {
    shipmentId: id,
    orderId: `ORD-${id}`,
    shipmentStatus: 'SucessoPagamento',
    trackingUrl: '',
    labelUrl: '',
    declarationUrl: '',
    receiptNotificationUrl: '',
    quotation: {
      carrier: 'Correios',
      carrierCode: 'COR',
      shippingServiceCode: 3298,
      shippingServiceName: 'PAC',
      shippingPrice: 17.06,
      deliveryTime: 7,
    },
    volumes: [],
  }
}

/**
 * A fake of GET /shipments and GET /orders honouring only the documented
 * `page` and `per_page`, answering `ShipmentsResponse` (`total`, `shipments`).
 * Pages are read as 1-based.
 */
function fakeCollection(total: number) {
  const all = Array.from({ length: total }, (_, i) => row(1000 + i))
  get.mockImplementation(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    for (const k of Object.keys(params)) {
      if (k !== 'page' && k !== 'per_page') throw new Error(`undocumented query parameter ${k}`)
    }
    if (path !== '/shipments' && path !== '/orders') throw new Error(`unexpected path ${path}`)
    const page = Number(params['page'])
    const perPage = Number(params['per_page'])
    return { data: { total, shipments: all.slice((page - 1) * perPage, page * perPage) } }
  })
}

describe('frenet WhiteLabel client', () => {
  it('sends the client token and the partner token to whitelabel.frenet.com.br/v1', async () => {
    fakeCollection(0)
    await new FrenetAdapter({ partnerToken: PARTNER }).listShipments(
      CREDS,
      withPageSink({ page: 1, limit: 5 }),
    )
    expect(create).toHaveBeenCalledTimes(1)
    const cfg = create.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe('https://whitelabel.frenet.com.br/v1')
    expect(cfg.headers['token']).toBe('client-token')
    expect(cfg.headers['x-partner-token']).toBe(PARTNER)
  })

  it.each([
    [
      'listShipments',
      (a: FrenetAdapter) => a.listShipments(CREDS, withPageSink({ page: 1, limit: 5 })),
    ],
    ['listOrders', (a: FrenetAdapter) => a.listOrders(CREDS, withPageSink({ page: 1, limit: 5 }))],
    ['getShipment', (a: FrenetAdapter) => a.getShipment(CREDS, '12670')],
    ['getOrder', (a: FrenetAdapter) => a.getOrder(CREDS, '12670')],
    ['getLabel', (a: FrenetAdapter) => a.getLabel(CREDS, '12670')],
  ])(
    '%s refuses with 501 and sends nothing when no partner token is configured',
    async (_name, call) => {
      const err = await rejection(call(new FrenetAdapter()))
      expect(err.statusCode).toBe(501)
      expect(err.code).toBe('NOT_SUPPORTED')
      expect(err.message).toMatch(/x-partner-token/)
      expect(create).not.toHaveBeenCalled()
      expectNoRequest()
    },
  )
})

describe.each([
  ['listShipments', '/shipments', ShipmentSchema],
  ['listOrders', '/orders', OrderSchema],
] as const)('frenet %s', (method, path, Schema) => {
  const list = (a: FrenetAdapter, params: ReturnType<typeof withPageSink>) =>
    method === 'listShipments' ? a.listShipments(CREDS, params) : a.listOrders(CREDS, params)

  it(`sends GET ${path} with the caller's page and per_page`, async () => {
    fakeCollection(0)
    await list(new FrenetAdapter({ partnerToken: PARTNER }), withPageSink({ page: 3, limit: 7 }))
    expect(get).toHaveBeenCalledWith(path, { params: { page: 3, per_page: 7 } })
  })

  it('walks 2L+1 rows once each, with hasMore exact from total', async () => {
    const L = 2
    fakeCollection(2 * L + 1)
    const adapter = new FrenetAdapter({ partnerToken: PARTNER })
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, params)
      for (const r of rows) seen.push(Schema.parse(r).id!)
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
    }
    expect(seen).toEqual(['1000', '1001', '1002', '1003', '1004'])
    expect(new Set(seen).size).toBe(seen.length)
    expect(more).toEqual([true, true, false])
  })

  it('reports hasMore false when the total is an exact multiple of the page size', async () => {
    fakeCollection(4)
    const params = withPageSink({ page: 2, limit: 2 })
    await list(new FrenetAdapter({ partnerToken: PARTNER }), params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('sends a large limit unclamped, since no per_page maximum is documented', async () => {
    fakeCollection(0)
    await list(new FrenetAdapter({ partnerToken: PARTNER }), withPageSink({ page: 1, limit: 500 }))
    expect(get).toHaveBeenCalledWith(path, { params: { page: 1, per_page: 500 } })
  })

  it('reports hasMore false for a page past the end', async () => {
    fakeCollection(3)
    const params = withPageSink({ page: 5, limit: 2 })
    const rows = await list(new FrenetAdapter({ partnerToken: PARTNER }), params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: 3 })
  })

  it.each([
    ['an empty page', 0],
    ['a short page', 1],
    ['an oversized page', 3],
  ])(
    'fails with 502 on %s inside total (per_page not honoured) instead of ending the walk',
    async (_label, n) => {
      get.mockResolvedValue({
        data: { total: 10, shipments: Array.from({ length: n }, (_, i) => row(1000 + i)) },
      })
      const params = withPageSink({ page: 1, limit: 2 })
      const err = await rejection(list(new FrenetAdapter({ partnerToken: PARTNER }), params))
      expect(err.statusCode).toBe(502)
      expect(err.code).toBe('UPSTREAM_PAGING')
      expect(readUpstreamPage(params)).toBeUndefined()
    },
  )

  it('reports nothing when the response carries no total', async () => {
    get.mockResolvedValue({ data: { shipments: [row(1)] } })
    const params = withPageSink({ page: 1, limit: 1 })
    const rows = await list(new FrenetAdapter({ partnerToken: PARTNER }), params)
    expect(rows).toHaveLength(1)
    expect(readUpstreamPage(params)).toBeUndefined()
  })
})

describe('frenet single-record reads', () => {
  it('getShipment reads GET /shipments/{shipmentId}', async () => {
    get.mockResolvedValue({ data: row(12670) })
    const s = await new FrenetAdapter({ partnerToken: PARTNER }).getShipment(CREDS, '12670')
    expect(get).toHaveBeenCalledWith('/shipments/12670', { params: undefined })
    expect(ShipmentSchema.parse(s).id).toBe('12670')
  })

  it('getOrder reads GET /orders/{shipmentId}', async () => {
    get.mockResolvedValue({ data: row(12670) })
    const o = await new FrenetAdapter({ partnerToken: PARTNER }).getOrder(CREDS, '12670')
    expect(get).toHaveBeenCalledWith('/orders/12670', { params: undefined })
    expect(OrderSchema.parse(o).orderNumber).toBe('ORD-12670')
  })

  it('getLabel reads GET /shipments/{shipmentId}/label', async () => {
    get.mockResolvedValue({
      data: {
        shipmentId: 12670,
        orderId: 'ORD-1002',
        shipmentStatus: 'SucessoPagamento',
        labelUrl:
          'http://painel-h03.frenet.dev/PrintPreviewCart/Label?shippingOrderId=12670&integration=7085&layout=9',
      },
    })
    const l = await new FrenetAdapter({ partnerToken: PARTNER }).getLabel(CREDS, '12670')
    expect(get).toHaveBeenCalledWith('/shipments/12670/label', { params: undefined })
    expect(LabelSchema.parse(l).shipmentId).toBe('12670')
  })

  it.each([
    ['getShipment', (a: FrenetAdapter) => a.getShipment(CREDS, 'shp_1')],
    ['getOrder', (a: FrenetAdapter) => a.getOrder(CREDS, '../x')],
    ['getLabel', (a: FrenetAdapter) => a.getLabel(CREDS, '')],
  ])('%s rejects a non-integer shipmentId before any request', async (_name, call) => {
    const err = await rejection(call(new FrenetAdapter({ partnerToken: PARTNER })))
    expect(err.statusCode).toBe(400)
    expectNoRequest()
  })
})

describe('frenet tracking', () => {
  it('listTrackingEvents refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    const err = await rejection(
      new FrenetAdapter({ partnerToken: PARTNER }).listTrackingEvents(
        CREDS,
        withPageSink({ page: 1, limit: 5 }),
      ),
    )
    expect(err.statusCode).toBe(501)
    expect(err.code).toBe('NOT_SUPPORTED')
    expect(err.message).toMatch(/^Frenet cannot list tracking events: /)
    expect(create).not.toHaveBeenCalled()
    expectNoRequest()
  })

  it('getTrackingEvents POSTs the required ShippingServiceCode and TrackingNumber to api.frenet.com.br', async () => {
    post.mockResolvedValue({
      data: {
        ServiceDescrition: 'TESTE (OBJETO PARA TREINAMENTO)',
        TrackingUrl: 'https://rastreio.frenet.com.br/COR/TE123456785AA',
        TrackingEvents: [
          {
            EventDateTime: '10/02/2017 16:48',
            EventDescription: 'Objeto entregue ao destinatário',
            EventLocation: 'Boa Nova-BA',
            EventType: '9',
          },
        ],
        TrackingNumber: 'TE123456785AA',
      },
    })
    const events = await new FrenetAdapter().getTrackingEvents(CREDS, 'TE123456785AA', '04669')
    const cfg = create.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe('https://api.frenet.com.br')
    expect(cfg.headers['token']).toBe('client-token')
    expect(cfg.headers['x-partner-token']).toBeUndefined()
    expect(post).toHaveBeenCalledWith('/tracking/trackinginfo', {
      ShippingServiceCode: '04669',
      TrackingNumber: 'TE123456785AA',
    })
    expect(events).toHaveLength(1)
    expect(TrackingEventSchema.parse(events[0]).status).toBe('DELIVERED')
  })

  it('getTrackingEvents without a service code refuses with 400 and sends nothing', async () => {
    const err = await rejection(new FrenetAdapter().getTrackingEvents(CREDS, 'TE123456785AA'))
    expect(err.statusCode).toBe(400)
    expect(err.message).toMatch(/ShippingServiceCode/)
    expectNoRequest()
  })

  it('getTrackingEvents surfaces a documented ErrorMessage instead of an empty history', async () => {
    post.mockResolvedValue({ data: { ErrorMessage: 'stub upstream error', TrackingEvents: [] } })
    const err = await rejection(new FrenetAdapter().getTrackingEvents(CREDS, 'X', '04669'))
    expect(err.message).toMatch(/stub upstream error/)
  })
})

describe('frenet quotes host', () => {
  it('getRates posts /shipping/quote to api.frenet.com.br without a /v1 prefix', async () => {
    post.mockResolvedValue({ data: [] })
    await new FrenetAdapter().getRates(CREDS, {
      originAddress: { postalCode: '04757020' },
      destinationAddress: { postalCode: '14270000' },
      packages: [],
    } as unknown as Parameters<FrenetAdapter['getRates']>[1])
    const cfg = create.mock.calls[0]![0] as { baseURL: string }
    expect(cfg.baseURL).toBe('https://api.frenet.com.br')
    expect(post.mock.calls[0]![0]).toBe('/shipping/quote')
  })
})
