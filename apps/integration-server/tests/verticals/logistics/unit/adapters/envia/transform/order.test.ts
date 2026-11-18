/**
 * Fixture is the documented example response of GET /v4/orders
 * (https://docs.envia.com/reference/get-orders.md), trimmed only of fields the
 * transform does not read, with a shipment tracking number filled in on a
 * second package.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type EnviaOrder,
} from '../../../../../../../src/verticals/logistics/adapters/envia/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function docOrder(overrides: Partial<EnviaOrder> = {}): EnviaOrder {
  return {
    id: 58144641,
    status_id: 1,
    status_name: 'Payment Pending',
    ecart_status_id: 2,
    fulfillment_status_id: 3,
    created_at_ecommerce: '2026-07-06 19:29:19',
    estimated_delivery_in: null,
    order: {
      identifier: '2069',
      name: '2069',
      number: '2069',
      total_price: 212.2,
      discount: 0,
      subtotal: 212.2,
      cod: 0,
      currency: 'MXN',
    },
    customer: { name: 'Johanna Mosqueda', email: 'customer@example.com', phone: null },
    shop: { id: 116711, name: 'My Store - Woocommerce' },
    shipment_data: {
      shipping_address: {
        first_name: 'Johanna',
        last_name: 'Mosqueda',
        address_1: '28 a 58n, Cra. 79b',
        country_code: 'CO',
        state_code: 'DC',
        city_select: 'BOGOTA',
        email: 'customer@example.com',
      },
      locations: [
        {
          id: '6861965',
          first_name: 'My Warehouse',
          country_code: 'CO',
          city_select: 'BOGOTA',
          postal_code: '11001000',
          packages: [
            {
              id: 50367274,
              shipment: { tracking_number: null, file: null, shipment_id: null },
              products: [
                {
                  id: '300949903',
                  name: 'Restorative hair mask',
                  sku: null,
                  price: 10.5,
                  quantity: 3,
                },
              ],
            },
            {
              id: 50367275,
              shipment: { tracking_number: '7700112233', shipment_id: 991 },
              products: [],
            },
          ],
        },
      ],
    },
    tags: [],
    is_favorite: false,
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('parses the documented example with OrderSchema', () => {
    const o = OrderSchema.parse(transformOrder(docOrder()))
    expect(o.id).toBe('58144641')
    expect(o.orderNumber).toBe('2069')
    expect(o.status).toBe('PENDING')
    expect(o.currency).toBe('MXN')
    expect(o.totalAmount).toBe(21220)
    expect(o.subtotalAmount).toBe(21220)
    expect(o.discountAmount).toBe(0)
    expect(o.shipmentIds).toEqual(['7700112233'])
    expect(o.destinationAddress).toEqual({
      name: 'Johanna Mosqueda',
      street1: '28 a 58n, Cra. 79b',
      city: 'BOGOTA',
      state: 'DC',
      country: 'CO',
      email: 'customer@example.com',
    })
    expect(o.originAddress).toEqual({
      name: 'My Warehouse',
      city: 'BOGOTA',
      postalCode: '11001000',
      country: 'CO',
    })
    expect(o.lineItems).toEqual([
      { id: '300949903', name: 'Restorative hair mask', quantity: 3, unitAmount: 1050 },
    ])
  })

  it('omits every amount when the currency is absent, never defaulting one', () => {
    const o = transformOrder(docOrder({ order: { number: '1', total_price: 5, subtotal: 5 } }))
    expect(o.currency).toBeUndefined()
    expect(o.totalAmount).toBeUndefined()
    expect(o.subtotalAmount).toBeUndefined()
    OrderSchema.parse(o)
  })

  it.each([
    [1, 'PENDING'],
    [2, 'AWAITING_SHIPMENT'],
    [3, 'AWAITING_SHIPMENT'],
    [4, 'SHIPPED'],
    [5, 'CANCELLED'],
    [6, 'unknown'],
    [7, 'unknown'],
    [null, 'unknown'],
  ])('status_id %s -> %s', (id, expected) => {
    expect(transformOrder(docOrder({ status_id: id })).status).toBe(expected)
  })

  it('reads order.number and order.total_price, not look-alike fields', () => {
    const base = docOrder()
    const o = transformOrder({
      ...base,
      order: { ...base.order, name: '#2069', number: '2069-A', subtotal: 200, total_price: 212.2 },
    })
    expect(o.orderNumber).toBe('2069-A')
    expect(o.totalAmount).toBe(21220)
    expect(o.subtotalAmount).toBe(20000)
    OrderSchema.parse(o)
  })

  it('omits a country_code that is not ISO 3166 alpha-2 instead of passing it on', () => {
    const base = docOrder()
    const o = transformOrder({
      ...base,
      shipment_data: {
        ...base.shipment_data,
        shipping_address: { ...base.shipment_data!.shipping_address, country_code: 'Colombia' },
      },
    })
    expect(o.destinationAddress?.country).toBeUndefined()
    OrderSchema.parse(o)
  })

  it('does not guess an origin when the order ships from several locations', () => {
    const base = docOrder()
    const loc = base.shipment_data!.locations![0]!
    const o = transformOrder({
      ...base,
      shipment_data: { ...base.shipment_data, locations: [loc, { ...loc, id: '2' }] },
    })
    expect(o.originAddress).toBeUndefined()
  })

  it('leaves the zone-less created_at_ecommerce in metadata instead of guessing a timezone', () => {
    const o = transformOrder(docOrder())
    expect(o.orderAt).toBeUndefined()
    expect(o.createdAt).toBeUndefined()
    expect(o.metadata?.['created_at_ecommerce']).toBe('2026-07-06 19:29:19')
  })
})
