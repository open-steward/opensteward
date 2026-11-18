/**
 * Intelipost adapter reads, against the TMS Embarcador OpenAPI export
 * (Swagger 2.0, host api.intelipost.com.br, basePath /api/v1):
 * https://stoplight.io/api/v1/projects/intelipost/tms-embarcador/nodes/reference/openapi.json?fromExportButton=true&snapshotType=http_service
 *
 *   "/shipment_order": { "post": { "summary": "Criar pedido de entrega", ... } }
 *
 * `/shipment_order` has no GET, and every GET under `/shipment_order/` takes one
 * identifier in the path, so the four list methods refuse with 501 before any
 * request. The single-record reads are served by the documented lookups, and
 * every request sends the documented `api-key` header.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { withPageSink } from '@opensteward/shared'
import { IntelipostAdapter } from '../../../../../../src/verticals/logistics/adapters/intelipost/index'
import { ShipmentSchema } from '../../../../../../src/verticals/logistics/schema/shipment'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'
import { TrackingEventSchema } from '../../../../../../src/verticals/logistics/schema/trackingevent'
import { LabelSchema } from '../../../../../../src/verticals/logistics/schema/label'

const CREDS = { accessToken: 'ipk-key' }

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'))
}

const SHIPMENT_ORDER = fixture('shipment-order.json')
const BY_TRACKING_CODE = fixture('shipment-order-by-tracking-code.json')
const LABEL = fixture('label.json')

/** The documented GET lookups this adapter may call; anything else is a 404. */
function documentedGet(path: string): unknown {
  if (/^\/shipment_order\/get_label\/[^/]+\/[^/]+$/.test(path)) return LABEL
  if (/^\/shipment_order\/tracking_code\/[^/]+$/.test(path)) return BY_TRACKING_CODE
  if (/^\/shipment_order\/[^/]+$/.test(path)) return SHIPMENT_ORDER
  throw Object.assign(new Error(`undocumented path ${path}`), { response: { status: 404 } })
}

describe('intelipost adapter reads', () => {
  const get = vi.fn()
  const post = vi.fn()
  const create = vi.fn()

  beforeEach(() => {
    get.mockImplementation(async (path: string) => ({ data: documentedGet(path) }))
    create.mockReturnValue({ get, post } as unknown as ReturnType<typeof axios.create>)
    vi.spyOn(axios, 'create').mockImplementation(create)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    get.mockReset()
    post.mockReset()
    create.mockReset()
  })

  describe('list methods refuse with 501 NOT_SUPPORTED and send nothing', () => {
    const cases: Array<[string, (a: IntelipostAdapter) => Promise<unknown>, RegExp]> = [
      [
        'listShipments',
        (a) => a.listShipments(CREDS, withPageSink({ page: 1, limit: 5 })),
        /^Intelipost cannot list shipments: .*"Criar pedido de entrega"/,
      ],
      [
        'listOrders',
        (a) => a.listOrders(CREDS, withPageSink({ page: 1, limit: 5 })),
        /^Intelipost cannot list orders: .*"Criar pedido de entrega"/,
      ],
      [
        'listTrackingEvents',
        (a) => a.listTrackingEvents(CREDS, withPageSink({ page: 1, limit: 5 })),
        /^Intelipost cannot list tracking events: .*shipment_order_volume_state_history_array/,
      ],
      [
        'listLabels',
        (a) => a.listLabels(CREDS, withPageSink({ page: 1, limit: 5 })),
        /^Intelipost cannot list labels: .*get_label/,
      ],
    ]

    for (const [name, call, message] of cases) {
      it(`${name}`, async () => {
        const err = (await call(new IntelipostAdapter()).then(
          () => {
            throw new Error(`${name} resolved`)
          },
          (e: unknown) => e,
        )) as Error & { statusCode?: number; code?: string }
        expect(err.message).toMatch(message)
        expect(err.statusCode).toBe(501)
        expect(err.code).toBe('NOT_SUPPORTED')
        expect(create).not.toHaveBeenCalled()
        expect(get).not.toHaveBeenCalled()
        expect(post).not.toHaveBeenCalled()
      })
    }
  })

  it('sends the documented api-key header to the documented host', async () => {
    await new IntelipostAdapter().getShipment(CREDS, '6474787')
    const config = create.mock.calls[0][0] as { baseURL: string; headers: Record<string, string> }
    expect(config.baseURL).toBe('https://api.intelipost.com.br/api/v1')
    expect(config.headers['api-key']).toBe('ipk-key')
    expect(config.headers).not.toHaveProperty('api_key')
  })

  it('getShipment reads GET /shipment_order/{order_number}', async () => {
    const s = ShipmentSchema.parse(await new IntelipostAdapter().getShipment(CREDS, '6474787'))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][0]).toBe('/shipment_order/6474787')
    expect(s.id).toBe('6474787')
    expect(s.trackingNumber).toBe('PZ562304249BR')
  })

  it('getOrder reads GET /shipment_order/{order_number}', async () => {
    const o = OrderSchema.parse(await new IntelipostAdapter().getOrder(CREDS, '6474787'))
    expect(get.mock.calls[0][0]).toBe('/shipment_order/6474787')
    expect(o.id).toBe('6474787')
    expect(o.shipmentIds).toEqual(['6474787'])
  })

  it('getTrackingEvents reads GET /shipment_order/tracking_code/{code}', async () => {
    const events = await new IntelipostAdapter().getTrackingEvents(CREDS, 'PZ562304306BR')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][0]).toBe('/shipment_order/tracking_code/PZ562304306BR')
    const parsed = events.map((e) => TrackingEventSchema.parse(e))
    expect(parsed.map((e) => e.trackingNumber)).toEqual(['PZ562304306BR', 'PZ562304306BR'])
    expect(parsed.map((e) => e.shipmentId)).toEqual(['156151', '156151'])
    expect(new Set(parsed.map((e) => e.id)).size).toBe(2)
  })

  it('getTrackingEvents keeps only the volumes carrying the asked tracking code', async () => {
    const events = await new IntelipostAdapter().getTrackingEvents(CREDS, 'OTHER-CODE')
    expect(get.mock.calls[0][0]).toBe('/shipment_order/tracking_code/OTHER-CODE')
    expect(events).toEqual([])
  })

  it('getLabel reads GET /shipment_order/get_label/{order}/{volume}', async () => {
    const l = LabelSchema.parse(await new IntelipostAdapter().getLabel(CREDS, 'PEDIDO0004:1'))
    expect(get.mock.calls[0][0]).toBe('/shipment_order/get_label/PEDIDO0004/1')
    expect(l.id).toBe('PEDIDO0004:1')
    expect(l.url).toBe(
      'http://.../api/v1/label/get/228796/230703/a2357eb8a64b4d3f4000f6fa8fc25bc3f02157f6c61bd957b4412131dd96499d/PEDIDO0004_sedex_12.pdf',
    )
  })

  describe('a 200 without content raises the named error', () => {
    beforeEach(() => {
      get.mockImplementation(async () => ({ data: { status: 'OK', messages: [] } }))
    })
    it('getShipment', async () => {
      await expect(new IntelipostAdapter().getShipment(CREDS, '6474787')).rejects.toThrow(
        'Intelipost: no content in response for shipment 6474787',
      )
    })
    it('getOrder', async () => {
      await expect(new IntelipostAdapter().getOrder(CREDS, '6474787')).rejects.toThrow(
        /^Intelipost: no content in response for order 6474787$/,
      )
    })
    it('getLabel', async () => {
      await expect(new IntelipostAdapter().getLabel(CREDS, 'PEDIDO0004:1')).rejects.toThrow(
        'Intelipost: no content in response for label PEDIDO0004:1',
      )
    })
  })

  for (const id of ['PEDIDO0004', 'PEDIDO0004:', ':1']) {
    it(`getLabel refuses "${id}" (get_label needs an order and a volume) and sends nothing`, async () => {
      const err = (await new IntelipostAdapter().getLabel(CREDS, id).then(
        () => {
          throw new Error('resolved')
        },
        (e: unknown) => e,
      )) as Error & { statusCode?: number }
      expect(err.statusCode).toBe(400)
      expect(get).not.toHaveBeenCalled()
    })
  }
})
