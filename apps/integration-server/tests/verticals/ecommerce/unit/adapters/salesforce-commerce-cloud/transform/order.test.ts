import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawScapiOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/salesforce-commerce-cloud/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawScapiOrder> = {}): RawScapiOrder {
  return {
    orderNo: 'ORD-0001',
    currency: 'USD',
    orderTotal: 109.97,
    productSubTotal: 99.99,
    taxTotal: 8.99,
    shippingTotal: 4.99,
    orderPriceAdjustmentsTotal: -5.0,
    status: 'new',
    paymentStatus: 'paid',
    customerInfo: {
      customerId: 'cust-001',
      email: 'alice@example.com',
    },
    productItems: [
      {
        itemId: 'item-1',
        productId: 'product-abc',
        productName: 'Running Shoes',
        quantity: 1,
        price: 99.99,
        basePrice: 99.99,
        sku: 'SHOES-S',
      },
    ],
    billingAddress: {
      address1: '221B Baker Street',
      city: 'London',
      postalCode: 'NW1 6XE',
      countryCode: 'GB',
    },
    shipments: [
      {
        shipmentId: 'shipment-1',
        shippingStatus: 'shipped',
        shippingAddress: {
          address1: '221B Baker Street',
          city: 'London',
          postalCode: 'NW1 6XE',
          countryCode: 'GB',
        },
      },
    ],
    couponItems: [{ code: 'SAVE5' }],
    createdAt: '2024-05-01T10:00:00Z',
    lastModified: '2024-05-02T08:00:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields using orderNo as id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ORD-0001')
    expect(result.orderNumber).toBe('ORD-0001')
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('cust-001')
    expect(result.email).toBe('alice@example.com')
  })

  it('converts money fields to minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 10997, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 9999, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 899, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'USD' })
  })

  it('maps financialStatus from paymentStatus', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps fulfillmentStatus from shipments shipping statuses', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('item-1')
    expect(li.productId).toBe('product-abc')
    expect(li.title).toBe('Running Shoes')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 9999, currency: 'USD' })
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('221B Baker Street')
    expect(result.billingAddress?.country).toBe('GB')
    expect(result.shippingAddress?.city).toBe('London')
  })

  it('maps coupon codes', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE5'])
  })

  it('maps fulfillment shipment ids', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toContain('shipment-1')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.currency).toBe('USD')
    expect((raw.customerInfo as { email: string }).email).toBe('alice@example.com')
  })
})
