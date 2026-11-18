/**
 * Doc: https://developer.octopia-io.net/api-reference/orders-management/
 * (verbatim `parcels[]` shape and `POST /orders/{orderId}/shipments` fields
 * quoted in the source file header).
 */
import { describe, it, expect } from 'vitest'
import {
  transformFulfillmentsFromOrder,
  untransformFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/cdiscount-marketplace/transform/fulfillment'
import type { RawOctopiaOrder } from '../../../../../../../src/verticals/ecommerce/adapters/cdiscount-marketplace/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrder(): RawOctopiaOrder {
  return {
    orderId: 'SELLZZ210525142759UT8E',
    reference: 'cmd_FFM_001',
    status: 'Shipped',
    currencyCode: 'EUR',
    lines: [
      {
        orderLineId: '1RT2',
        quantity: 10,
        offer: { id: 'x', productId: 'x', productTitle: 'abc001', sellerProductId: '135_abc123' },
        sellingPrice: { unitSalesPrice: 41.99 },
        parcels: [
          {
            parcelNumber: '34GFRTG43',
            carrierName: 'Chronopost',
            trackingUrl: 'www.trackingUrl.com/34GFRTG43',
            trackingId: 'deabfa7c-e6ef-4832-bcee-444398f23e0c',
          },
        ],
      },
    ],
  }
}

describe('transformFulfillmentsFromOrder (Cdiscount Marketplace / Octopia)', () => {
  it('derives one fulfillment per parcel, keyed orderId:parcelNumber', () => {
    const [f] = transformFulfillmentsFromOrder(makeOrder())
    expect(f!.id).toBe('SELLZZ210525142759UT8E:34GFRTG43')
    expect(f!.orderId).toBe('SELLZZ210525142759UT8E')
    expect(f!.status).toBe('SUCCESS')
    expect(f!.trackingNumber).toBe('deabfa7c-e6ef-4832-bcee-444398f23e0c')
    expect(f!.carrier).toBe('Chronopost')
    // The docs' own trackingUrl example has no scheme — normalised to https://.
    expect(f!.trackingUrl).toBe('https://www.trackingUrl.com/34GFRTG43')
    expect(f!.lineItems).toEqual([{ lineItemId: '1RT2', quantity: 10 }])
  })

  it('returns nothing for a line with no parcels yet', () => {
    const order = makeOrder()
    order.lines[0]!.parcels = undefined
    expect(transformFulfillmentsFromOrder(order)).toEqual([])
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const [f] = transformFulfillmentsFromOrder(makeOrder())
    expect(() => FulfillmentSchema.parse(f)).not.toThrow()
  })
})

describe('untransformFulfillment (Cdiscount Marketplace / Octopia)', () => {
  it('builds a POST /orders/{orderId}/shipments body', () => {
    const body = untransformFulfillment({ trackingNumber: 'P123', carrier: 'Chronopost' })
    expect(body).toEqual([{ parcelNumber: 'P123', carrierName: 'Chronopost' }])
  })

  it('throws when trackingNumber or carrier is missing', () => {
    expect(() => untransformFulfillment({ carrier: 'Chronopost' })).toThrow()
    expect(() => untransformFulfillment({ trackingNumber: 'P123' })).toThrow()
  })
})
