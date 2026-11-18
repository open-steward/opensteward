/**
 * pandago listOrders refuses: the vendor documents no order collection.
 *
 * First-party spec: the OpenAPI document embedded in Delivery Hero's own docs
 * page (https://on-demand-rider-docs.deliveryhero.io/, "On Demand Rider API"
 * 1.1.1). Its only operations under /orders are
 *   POST /orders                    "Create a New Order"
 *   GET/PUT/DELETE /orders/{order_id} "Get Specific Order" / update / cancel
 *   POST /orders/fee, POST /orders/time (estimates)
 *   GET /orders/{order_id}/coordinates, GET /orders/proof_of_*\/{order_id}
 * There is no `GET /orders`. The adapter used to send invented `limit` and
 * `cursor` parameters to that non-existent path.
 *
 * getOrder stays: `GET /orders/{order_id}` is documented.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { PandagoAdapter } from '../../../../../../src/verticals/logistics/adapters/pandago/index'
import { OrderSchema } from '../../../../../../src/verticals/logistics/schema/order'

const CREDS = { accessToken: 'tok', extra: { countryCode: 'sg' } }

// The documented GET /orders/{order_id} 200 example (GetOrderResponse -> OrderResponse)
// from the spec at https://on-demand-rider-docs.deliveryhero.io/, verbatim except
// order_id, which the fake keys its path on.
const DOCUMENTED_ORDER = {
  order_id: 'pg-ord-001',
  client_order_id: 'client-ref-000001',
  sender: {
    name: 'ODR',
    phone_number: '+6500000000',
    location: { address: '1 2nd Street #08-01', latitude: 1.2923742, longitude: 103.8486029 },
    notes: 'use the left side door',
  },
  recipient: {
    name: 'Merlion',
    phone_number: '+6500000000',
    location: { address: '20 Esplanade Drive', latitude: 1.2857488, longitude: 103.8548608 },
    notes: '2nd floor - door 3, use lift A and leave at the front door',
  },
  distance: 906.13,
  payment_method: 'PAID',
  coldbag_needed: false,
  description: 'Refreshing drink',
  amount: 23.5,
  status: 'NEW',
  delivery_fee: 8.17,
  timeline: { estimated_pickup_time: '', estimated_delivery_time: '' },
  driver: { id: '', name: '', phone_number: '' },
  created_at: 1536802000,
  updated_at: 1536802000,
  tracking_link: 'https://example.com/test_tracking_path',
}

function fakeHttp() {
  const get = vi.fn(async (path: string) => {
    if (path === '/orders/pg-ord-001') {
      return { data: DOCUMENTED_ORDER }
    }
    throw new Error(`unexpected GET ${path}`)
  })
  const post = vi.fn()
  const put = vi.fn()
  const del = vi.fn()
  const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post, put, delete: del } as never)
  return { create, get, post, put, del }
}

afterEach(() => vi.restoreAllMocks())

describe('pandago listOrders', () => {
  it('throws 501 NOT_SUPPORTED naming the missing endpoint, and sends no request', async () => {
    const http = fakeHttp()
    const err = await new PandagoAdapter().listOrders(CREDS, { page: 1, limit: 50 }).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect((err as Error).message).toMatch(/pandago cannot list orders: .*no GET \/orders/)
    expect(http.create).not.toHaveBeenCalled()
    expect(http.get).not.toHaveBeenCalled()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('also refuses page 2 (no request is sent for any page)', async () => {
    const http = fakeHttp()
    await expect(
      new PandagoAdapter().listOrders(CREDS, { page: 2, limit: 5 }),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(http.get).not.toHaveBeenCalled()
  })
})

describe('pandago getOrder', () => {
  it('reads the documented GET /orders/{order_id}', async () => {
    const http = fakeHttp()
    const order = await new PandagoAdapter().getOrder(CREDS, 'pg-ord-001')
    expect(http.get).toHaveBeenCalledTimes(1)
    expect(http.get.mock.calls[0]![0]).toBe('/orders/pg-ord-001')
    expect(order.id).toBe('pg-ord-001')
    expect(order.orderNumber).toBe('client-ref-000001')
    expect(order.destinationAddress?.street1).toBe('20 Esplanade Drive')
    expect(order.createdAt).toEqual(new Date(1536802000 * 1000))
    expect(() => OrderSchema.parse(order)).not.toThrow()
  })
})
