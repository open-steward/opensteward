import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopifyOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopaccino/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawShopifyOrder> = {}): RawShopifyOrder {
  return {
    id: 10001,
    order_number: 1042,
    name: '#1042',
    customer: { id: 55001 },
    email: 'buyer@example.com',
    currency: 'USD',
    subtotal_price: '59.99',
    total_tax: '5.40',
    total_discounts: '0.00',
    total_price: '65.39',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [
      {
        id: 201,
        product_id: 301,
        variant_id: 401,
        title: 'Widget',
        quantity: 2,
        price: '29.99',
        total_discount: '0.00',
        sku: 'WID-001',
      },
    ],
    billing_address: {
      address1: '1 Billing Rd',
      city: 'Dallas',
      zip: '75201',
      country_code: 'US',
    },
    shipping_address: {
      address1: '2 Ship St',
      city: 'Dallas',
      zip: '75202',
      country_code: 'US',
    },
    tags: 'new-customer',
    created_at: '2024-03-01T09:00:00.000Z',
    updated_at: '2024-03-02T11:00:00.000Z',
    ...overrides,
  }
}

describe('shopaccino transformOrder', () => {
  it('maps id and orderNumber to strings', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('10001')
    expect(result.orderNumber).toBe('1042')
  })

  it('maps financial and fulfillment status via STATUS_MAPs', () => {
    const result = transformOrder(makeRaw())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts totalPrice to minor units (USD: ×100)', () => {
    const result = transformOrder(makeRaw())
    // 65.39 USD = 6539 cents
    expect(result.totalPrice?.amount).toBe(6539)
    expect(result.totalPrice?.currency).toBe('USD')
  })

  it('maps line item price to minor units', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems![0].price.amount).toBe(2999)
    expect(result.lineItems![0].title).toBe('Widget')
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(makeRaw())
    expect(result.billingAddress?.city).toBe('Dallas')
    expect(result.shippingAddress?.line1).toBe('2 Ship St')
  })

  it('splits comma-separated tags', () => {
    const result = transformOrder(makeRaw())
    expect(result.tags).toEqual(['new-customer'])
  })

  it('produces output that passes OrderSchema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformOrder', () => {
    const canonical = transformOrder(makeRaw())
    const back = untransformOrder(canonical)
    expect(back.email).toBe('buyer@example.com')
    expect(back.currency).toBe('USD')
  })
})
