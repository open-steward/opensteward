import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawFabricOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/fabric/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawFabricOrder> = {}): RawFabricOrder {
  return {
    id: 'ord-001',
    order_number: '1001',
    name: '#1001',
    customer_id: 'cust-001',
    email: 'jane@example.com',
    phone: '+1-555-0100',
    currency: 'USD',
    subtotal_price: 89.99,
    total_tax: 7.20,
    total_discounts: 10.00,
    total_shipping: 5.99,
    total_price: 93.18,
    financial_status: 'paid',
    fulfillment_status: 'unfulfilled',
    line_items: [
      {
        id: 'li-001',
        product_id: 'prod-001',
        variant_id: 'var-001',
        title: 'Wireless Headphones',
        quantity: 1,
        price: 89.99,
        currency: 'USD',
        sku: 'WH-001',
        fulfillable_quantity: 1,
        fulfillment_status: 'unfulfilled',
      },
    ],
    billing_address: {
      line1: '456 Main St',
      city: 'Portland',
      state: 'OR',
      postal_code: '97201',
      country: 'US',
    },
    shipping_address: {
      line1: '456 Main St',
      city: 'Portland',
      state: 'OR',
      postal_code: '97201',
      country: 'US',
    },
    tags: ['priority'],
    note: 'Gift wrap please',
    created_at: '2024-07-01T10:00:00Z',
    updated_at: '2024-07-01T10:05:00Z',
    processed_at: '2024-07-01T10:01:00Z',
    ...overrides,
  }
}

describe('transformOrder (fabric)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ord-001')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
    expect(result.customerId).toBe('cust-001')
    expect(result.email).toBe('jane@example.com')
    expect(result.currency).toBe('USD')
  })

  it('maps money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 8999, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 720, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 1000, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 599, currency: 'USD' })
    expect(result.totalPrice).toEqual({ amount: 9318, currency: 'USD' })
  })

  it('maps financial status', () => {
    expect(transformOrder(makeOrder({ financial_status: 'paid' })).financialStatus).toBe('PAID')
    expect(transformOrder(makeOrder({ financial_status: 'pending' })).financialStatus).toBe('PENDING')
    expect(transformOrder(makeOrder({ financial_status: 'refunded' })).financialStatus).toBe('REFUNDED')
    expect(transformOrder(makeOrder({ financial_status: 'voided' })).financialStatus).toBe('VOIDED')
  })

  it('maps fulfillment status', () => {
    expect(transformOrder(makeOrder({ fulfillment_status: 'unfulfilled' })).fulfillmentStatus).toBe('UNFULFILLED')
    expect(transformOrder(makeOrder({ fulfillment_status: 'fulfilled' })).fulfillmentStatus).toBe('FULFILLED')
    expect(transformOrder(makeOrder({ fulfillment_status: 'partial' })).fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-001')
    expect(li.productId).toBe('prod-001')
    expect(li.title).toBe('Wireless Headphones')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 8999, currency: 'USD' })
  })

  it('maps addresses', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('456 Main St')
    expect(result.shippingAddress?.city).toBe('Portland')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (fabric)', () => {
  it('round-trips writable fields', () => {
    const body = untransformOrder({
      customerId: 'cust-001',
      email: 'jane@example.com',
      currency: 'USD',
      note: 'Rush order',
    }) as Record<string, unknown>
    expect(body['customer_id']).toBe('cust-001')
    expect(body['email']).toBe('jane@example.com')
    expect(body['currency']).toBe('USD')
    expect(body['note']).toBe('Rush order')
  })
})
