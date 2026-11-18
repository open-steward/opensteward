/**
 * Doc: https://developer.octopia-io.net/api-reference/orders-management/
 * (verbatim GET /orders / GET /orders/{orderId} response examples quoted in
 * the source file header).
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFulfillmentStatus,
  type RawOctopiaOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/cdiscount-marketplace/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawOctopiaOrder> = {}): RawOctopiaOrder {
  return {
    orderId: 'SELLZZ210525142759UT8E',
    reference: 'cmd_FFM_001',
    status: 'Accepted',
    currencyCode: 'EUR',
    createdAt: '2023-12-25T14:30:00Z',
    updatedAt: '2023-12-25T14:30:00Z',
    purchasedAt: '2023-12-25T14:30:00Z',
    customer: { reference: 'custm_001' },
    billingAddress: {
      firstName: 'Thomas',
      lastName: 'Dupont',
      addressLine1: '71 rue de la Paix',
      addressLine2: 'Residence Jean Moulin',
      addressLine3: 'appartement 213',
      postalCode: '75001',
      city: 'Paris',
      stateOrRegion: 'OP',
      countryCode: 'FR',
    },
    totalPrice: { offerPrice: 130.97, sellingPrice: 130.97 },
    lines: [
      {
        orderLineId: '1RT2',
        quantity: 10,
        offer: { id: 'XooAzb123', sellerProductId: '135_abc123', productId: 'XooAzb123', productTitle: 'abc001' },
        sellingPrice: { unitSalesPrice: 41.99 },
        shippingAddress: {
          firstName: 'Thomas',
          lastName: 'Dupont',
          addressLine1: '71 rue de la Paix',
          postalCode: '75001',
          city: 'Paris',
          countryCode: 'FR',
          phone: '+33176548976',
          email: 'c.0ab9cd8efa7654b32cde109fa8bc7d@clemarche.com',
        },
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
    ...overrides,
  }
}

describe('mapFulfillmentStatus (Cdiscount Marketplace / Octopia)', () => {
  it('maps Shipped/Delivered to PARTIAL/FULFILLED', () => {
    expect(mapFulfillmentStatus('Shipped')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('Delivered')).toBe('FULFILLED')
  })

  it('maps pre-shipment and terminal-non-delivery states to UNFULFILLED', () => {
    for (const s of ['Processing', 'WaitingAcceptance', 'Accepted', 'InPreparation', 'Refused', 'Cancelled', 'Rejected']) {
      expect(mapFulfillmentStatus(s)).toBe('UNFULFILLED')
    }
  })

  it('falls back to unknown for an unrecognised status', () => {
    expect(mapFulfillmentStatus('SomethingNew')).toBe('unknown')
  })
})

describe('transformOrder (Cdiscount Marketplace / Octopia)', () => {
  it('maps top-level identity and totals', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('SELLZZ210525142759UT8E')
    expect(result.orderNumber).toBe('cmd_FFM_001')
    expect(result.customerId).toBe('custm_001')
    expect(result.currency).toBe('EUR')
    expect(result.totalPrice).toEqual({ amount: 13097, currency: 'EUR' })
  })

  it('lifts the first line’s shipping address email/phone to the order level', () => {
    const result = transformOrder(makeRaw())
    expect(result.email).toBe('c.0ab9cd8efa7654b32cde109fa8bc7d@clemarche.com')
    expect(result.phone).toBe('+33176548976')
    expect(result.shippingAddress?.city).toBe('Paris')
    expect(result.shippingAddress?.country).toBe('FR')
  })

  it('maps billingAddress including the combined addressLine2/3', () => {
    const result = transformOrder(makeRaw())
    expect(result.billingAddress?.line1).toBe('71 rue de la Paix')
    expect(result.billingAddress?.line2).toBe('Residence Jean Moulin appartement 213')
    expect(result.billingAddress?.region).toBe('OP')
  })

  it('maps line items with sku and price', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1RT2')
    expect(li.title).toBe('abc001')
    expect(li.sku).toBe('135_abc123')
    expect(li.price).toEqual({ amount: 4199, currency: 'EUR' })
  })

  it('sets cancelledAt only for terminal-cancel statuses', () => {
    const cancelled = transformOrder(makeRaw({ status: 'Cancelled' }))
    expect(cancelled.cancelledAt).toBe('2023-12-25T14:30:00.000Z')
    const active = transformOrder(makeRaw({ status: 'Accepted' }))
    expect(active.cancelledAt).toBeUndefined()
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })
})
