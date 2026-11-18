import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopifyOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

describe('transformOrder (bold-commerce)', () => {
  const raw: RawShopifyOrder = {
    id: 3001,
    order_number: 1042,
    name: '#1042',
    customer: { id: 55 },
    email: 'buyer@example.com',
    phone: '+1-800-5555',
    currency: 'USD',
    subtotal_price: '49.99',
    total_tax: '4.00',
    total_discounts: '5.00',
    total_price: '53.99',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [
      {
        id: 20,
        product_id: 100,
        variant_id: 200,
        title: 'Widget',
        quantity: 2,
        price: '24.99',
        total_discount: '0.00',
        sku: 'WID-01',
      },
    ],
    billing_address: {
      address1: '5 Billing Rd',
      city: 'Chicago',
      country_code: 'US',
      zip: '60601',
    },
    shipping_address: {
      address1: '5 Ship Rd',
      city: 'Chicago',
      country_code: 'US',
      zip: '60601',
    },
    discount_codes: [{ code: 'SAVE5' }],
    tags: 'priority, new',
    note: 'Handle with care',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformOrder(raw).id).toBe('3001')
  })

  it('maps orderNumber to string', () => {
    expect(transformOrder(raw).orderNumber).toBe('1042')
  })

  it('maps customerId from customer.id', () => {
    expect(transformOrder(raw).customerId).toBe('55')
  })

  it('maps financialStatus to PAID', () => {
    expect(transformOrder(raw).financialStatus).toBe('PAID')
  })

  it('maps fulfillmentStatus to FULFILLED', () => {
    expect(transformOrder(raw).fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts subtotal_price to minor units', () => {
    // 49.99 USD → 4999 cents
    expect(transformOrder(raw).subtotalPrice?.amount).toBe(4999)
    expect(transformOrder(raw).subtotalPrice?.currency).toBe('USD')
  })

  it('converts total_price to minor units', () => {
    // 53.99 USD → 5399 cents
    expect(transformOrder(raw).totalPrice?.amount).toBe(5399)
  })

  it('maps line items correctly', () => {
    const result = transformOrder(raw)
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems?.[0]?.title).toBe('Widget')
    expect(result.lineItems?.[0]?.quantity).toBe(2)
    // 24.99 → 2499
    expect(result.lineItems?.[0]?.price.amount).toBe(2499)
  })

  it('maps discount codes', () => {
    expect(transformOrder(raw).discountCodes).toEqual(['SAVE5'])
  })

  it('maps tags array', () => {
    expect(transformOrder(raw).tags).toEqual(['priority', 'new'])
  })

  it('maps note', () => {
    expect(transformOrder(raw).note).toBe('Handle with care')
  })

  it('maps billing and shipping addresses', () => {
    const result = transformOrder(raw)
    expect(result.billingAddress?.line1).toBe('5 Billing Rd')
    expect(result.shippingAddress?.city).toBe('Chicago')
  })

  it('passes OrderSchema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(raw))).not.toThrow()
  })
})

describe('untransformOrder (bold-commerce)', () => {
  it('round-trips email and note', () => {
    const canonical = transformOrder({
      id: 1,
      email: 'x@y.com',
      note: 'test note',
      currency: 'USD',
    })
    const body = untransformOrder(canonical)
    expect(body.email).toBe('x@y.com')
    expect(body.note).toBe('test note')
  })
})
