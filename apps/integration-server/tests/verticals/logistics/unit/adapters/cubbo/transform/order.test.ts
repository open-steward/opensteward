/**
 * Cubbo order transform, against the documented GET /v1/orders 200 example
 * ("Get Orders" in the collection behind https://developers.cubbo.com/).
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type CubboOrder,
} from '../../../../../../../src/verticals/logistics/adapters/cubbo/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

/** The first order of the documented example, verbatim apart from the product detail. */
function documentedOrder(overrides: Partial<CubboOrder> = {}): CubboOrder {
  return {
    id: 230,
    store_id: 3,
    order_number: 'dupes48',
    status: 'shipped',
    channel_created_at: '2021-10-19T19:36:44.273Z',
    order_date: '2021-10-19T19:36:44.273Z',
    shipping_date: '2022-01-27T18:58:39.369Z',
    pending_at: '2021-12-01T17:00:36.382Z',
    shipping_email: 'edo@cubbo.com',
    shipping_status: 'shipment_delivered',
    is_multi_package: false,
    is_paid: true,
    is_cod: false,
    currency: null,
    total_price: null,
    shipping: {
      first_name: 'edo',
      last_name: 'mon',
      company: null,
      phone: '5555555555',
      address_1: 'homero 100',
      address_2: null,
      email: 'edo@cubbo.com',
      zip_code: '11550',
      country: 'MX',
      state: 'cdmx',
      city: 'cdmx',
      number: null,
      neighborhood: null,
    },
    delivery_tracking: [
      {
        shipping_number: 'GETCUBBOCDMX9999999',
        tracking_url: 'https://mx.treggo.co/viaje/seguimiento.html?destino=GETCUBBOCDMX9999999',
        cubbo_tracking_url: 'https://tracking.cubbo.com/GETCUBBOCDMX9999999',
        service_id: '41837839234',
        shipping_status: 'shipment_delivered',
        package_index: 1,
        total_packages: 1,
      },
    ],
    estimated_time_arrival: '2025-11-09T05:59:59.999Z',
    delivered_at: '2025-11-08T21:30:00.000Z',
    updated_at: '2025-11-10T02:35:14.479Z',
    shipping_method: { id: 4, shipping_name: 'sameDay', carrier_name: 'TREGGO', is_cod: false },
    order_lines: [
      {
        id: 332,
        name: null,
        sku: null,
        quantity: 1,
        generated: false,
        price_per_item: null,
        product: { id: 36, name: 'cualquier cosa', product_codes: [{ id: 33, sku: '654546' }] },
        stock_units: [{ id: 10995, imei: null }],
      },
    ],
    invoices: [],
    store: { id: 3, name: 'Store Name' },
    ...overrides,
  }
}

describe('cubbo transformOrder', () => {
  it('maps the documented example and passes OrderSchema', () => {
    const out = OrderSchema.parse(transformOrder(documentedOrder()))
    expect(out.id).toBe('230')
    expect(out.orderNumber).toBe('dupes48')
    expect(out.status).toBe('DELIVERED')
    expect(out.destinationAddress).toEqual({
      name: 'edo mon',
      street1: 'homero 100',
      city: 'cdmx',
      state: 'cdmx',
      postalCode: '11550',
      country: 'MX',
      phone: '5555555555',
      email: 'edo@cubbo.com',
    })
    expect(out.lineItems).toEqual([{ id: '332', quantity: 1 }])
    expect(out.orderAt).toEqual(new Date('2021-10-19T19:36:44.273Z'))
    expect(out.shippedAt).toEqual(new Date('2022-01-27T18:58:39.369Z'))
    expect(out.deliveredAt).toEqual(new Date('2025-11-08T21:30:00.000Z'))
    expect(out.updatedAt).toEqual(new Date('2025-11-10T02:35:14.479Z'))
    expect(out.metadata).toMatchObject({ store_id: 3 })
  })

  it('invents no amounts and no currency when the documented fields are null', () => {
    const out = OrderSchema.parse(transformOrder(documentedOrder()))
    expect(out.currency).toBeUndefined()
    expect(out.totalAmount).toBeUndefined()
    expect(out.subtotalAmount).toBeUndefined()
    expect(out.customerId).toBeUndefined()
    expect(out.warehouseId).toBeUndefined()
  })

  it('carries a documented ISO 4217 currency', () => {
    expect(OrderSchema.parse(transformOrder(documentedOrder({ currency: 'MXN' }))).currency).toBe(
      'MXN',
    )
  })

  it('a shipped order not yet delivered stays SHIPPED', () => {
    const out = transformOrder(documentedOrder({ shipping_status: 'shipment_in_transit' }))
    expect(OrderSchema.parse(out).status).toBe('SHIPPED')
  })

  it.each([
    ['initial', 'PENDING'],
    ['pending', 'PENDING'],
    ['processing', 'PROCESSING'],
    ['picking', 'PROCESSING'],
    ['packing', 'PROCESSING'],
    ['hold', 'ON_HOLD'],
    ['canceled', 'CANCELLED'],
    ['interrupted', 'CANCELLED'],
    ['returning', 'RETURNED'],
    ['returned', 'RETURNED'],
    ['return_arrived', 'RETURNED'],
    ['reentered', 'RETURNED'],
    ['unpaid', 'unknown'],
    ['empty', 'unknown'],
    ['error', 'unknown'],
    ['entirely_dropshipping', 'unknown'],
    ['backorder', 'unknown'],
  ])('maps documented status %s to %s', (status, expected) => {
    const out = OrderSchema.parse(
      transformOrder(documentedOrder({ status, shipping_status: null })),
    )
    expect(out.status).toBe(expected)
  })

  it('drops a currency that is not an ISO 4217 code rather than failing OrderSchema', () => {
    const out = transformOrder(documentedOrder({ currency: 'pesos' }))
    expect(out.currency).toBeUndefined()
    expect(OrderSchema.parse(out).currency).toBeUndefined()
  })

  it.each([
    ['canceled', 'CANCELLED'],
    ['returned', 'RETURNED'],
    ['hold', 'ON_HOLD'],
  ])('shipment_delivered upgrades only a shipped order: %s stays %s', (status, expected) => {
    const out = transformOrder(documentedOrder({ status, shipping_status: 'shipment_delivered' }))
    expect(OrderSchema.parse(out).status).toBe(expected)
  })

  it('maps the documented order_lines name and sku when present', () => {
    const out = OrderSchema.parse(
      transformOrder(
        documentedOrder({
          order_lines: [{ id: 332, name: 'cualquier cosa', sku: '654546', quantity: 2 }],
        }),
      ),
    )
    expect(out.lineItems).toEqual([
      { id: '332', name: 'cualquier cosa', sku: '654546', quantity: 2 },
    ])
  })

  it('omits line items when order_lines is empty', () => {
    expect(OrderSchema.parse(transformOrder(documentedOrder({ order_lines: [] }))).lineItems).toBe(
      undefined,
    )
  })
})
