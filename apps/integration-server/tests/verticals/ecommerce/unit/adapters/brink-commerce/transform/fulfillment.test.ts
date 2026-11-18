/**
 * Fixtures follow `DeliveryDetails` / `Delivery` from the OrderManagement
 * OpenAPI embedded in
 * https://docs.brinkcommerce.com/technical/api-references/order/deliveries.md,
 * including the optional `tracking` object { reference, url, shippingMethod,
 * shippingCompany }.
 */
import { describe, it, expect } from 'vitest'
import {
  transformDelivery,
  untransformDelivery,
  type RawBrinkDelivery,
} from '../../../../../../../src/verticals/ecommerce/adapters/brink-commerce/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

const raw: RawBrinkDelivery = {
  id: '0b8f3c1e-8b0e-4f7c-9d4a-2f6f1b7d9e01',
  orderId: '2b7d1c52-5a8e-4a3f-9f55-0c1e6f3b2a10',
  orderReference: '100042',
  paymentProvider: { providerId: 'kco', providerName: 'KlarnaCheckout' },
  orderLines: [
    {
      orderLineId: '6f1a8c3e-1d2b-4e5f-8a9b-0c1d2e3f4a5b',
      quantity: 2,
      taxPercentage: 2500,
      taxPercentageDecimals: 2,
      currencyCode: 'SEK',
      totalAmount: 50000,
      totalTaxAmount: 10000,
      totalDiscountAmount: 0,
    },
  ],
  shippingFees: [],
  gifts: [],
  giftCards: [],
  giftCardProducts: [],
  tracking: {
    reference: '00340434161234567890',
    url: 'https://tracking.example.com/00340434161234567890',
    shippingMethod: 'Home delivery',
    shippingCompany: 'PostNord',
  },
  totals: {
    subTotal: 50000,
    taxTotal: 10000,
    shippingTotal: 0,
    giftCardTotal: 0,
    bonusTotal: 0,
    grandTotal: 50000,
  },
  created: '2024-03-02T08:00:00Z',
  updated: '2024-03-02T08:05:00Z',
  started: '2024-03-02T08:01:00Z',
  revision: 2,
}

describe('transformDelivery (brink-commerce)', () => {
  it('parses against FulfillmentSchema', () => {
    expect(() => FulfillmentSchema.parse(transformDelivery(raw))).not.toThrow()
  })

  it('maps ids and the tracking object', () => {
    expect(transformDelivery(raw)).toMatchObject({
      id: raw.id,
      orderId: raw.orderId,
      trackingNumber: '00340434161234567890',
      trackingUrl: 'https://tracking.example.com/00340434161234567890',
      carrier: 'PostNord',
      service: 'Home delivery',
      createdAt: '2024-03-02T08:00:00.000Z',
      updatedAt: '2024-03-02T08:05:00.000Z',
    })
  })

  it('leaves tracking fields unset when the delivery has no tracking', () => {
    const out = transformDelivery({ ...raw, tracking: undefined })
    expect(out.trackingNumber).toBeUndefined()
    expect(out.carrier).toBeUndefined()
  })

  it('maps line items from orderLineId and quantity', () => {
    expect(transformDelivery(raw).lineItems).toEqual([
      { lineItemId: '6f1a8c3e-1d2b-4e5f-8a9b-0c1d2e3f4a5b', quantity: 2 },
    ])
  })

  it('derives status from the documented timestamps', () => {
    expect(transformDelivery(raw).status).toBe('OPEN')
    expect(transformDelivery({ ...raw, completed: '2024-03-02T09:00:00Z' }).status).toBe('SUCCESS')
    expect(transformDelivery({ ...raw, failed: '2024-03-02T09:00:00Z' }).status).toBe('FAILURE')
    expect(transformDelivery({ ...raw, started: undefined }).status).toBe('PENDING')
  })
})

describe('untransformDelivery (brink-commerce)', () => {
  it('maps line items to orderLines', () => {
    const body = untransformDelivery({ lineItems: [{ lineItemId: 'li-1', quantity: 2 }] })
    expect(body['orderLines']).toEqual([{ orderLineId: 'li-1', quantity: 2 }])
  })
})
