import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type BagistoOrder,
  type BagistoAddress,
} from '../../../../../../../src/verticals/ecommerce/adapters/bagisto/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAddress(overrides: Partial<BagistoAddress> = {}): BagistoAddress {
  return {
    first_name: 'John',
    last_name: 'Doe',
    address1: '123 Main Street',
    city: 'New York',
    state: 'NY',
    postcode: '10001',
    country: 'US',
    email: 'john@example.com',
    phone: '+1 555 000 1234',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<BagistoOrder> = {}): BagistoOrder {
  return {
    id: 456,
    increment_id: '100000001',
    status: 'processing',
    grand_total: '59.98',
    base_grand_total: '59.98',
    sub_total: '49.98',
    tax_amount: '5.00',
    discount_amount: '0.00',
    shipping_amount: '5.00',
    order_currency_code: 'USD',
    customer_id: 789,
    customer_email: 'john@example.com',
    customer_first_name: 'John',
    customer_last_name: 'Doe',
    customer_phone: '+1 555 000 1234',
    items: [
      {
        id: 1,
        sku: 'PROD-001',
        name: 'Wireless Keyboard',
        type: 'simple',
        product_id: 5,
        qty_ordered: 2,
        price: '29.99',
        total: '59.98',
      },
    ],
    billing_address: makeAddress(),
    shipping_address: makeAddress({ address1: '456 Oak Ave', city: 'Brooklyn' }),
    created_at: '2024-01-15T10:00:00.000Z',
    updated_at: '2024-01-16T08:30:00.000Z',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformOrder (Bagisto)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('456')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('100000001')
    expect(result.name).toBe('#100000001')
    expect(result.email).toBe('john@example.com')
    expect(result.currency).toBe('USD')
  })

  it('maps customer id', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('789')
  })

  it('returns undefined customerId when customer_id is 0', () => {
    const result = transformOrder(makeOrder({ customer_id: 0 }))
    expect(result.customerId).toBeUndefined()
  })

  it('maps grand_total to totalPrice', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 5998, currency: 'USD' })
  })

  it('maps sub_total, tax_amount, discount_amount, shipping_amount', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 4998, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 500, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 0, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps status "processing" to PAID / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'processing' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status "completed" to PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'completed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps status "pending" to PENDING / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status "pending_payment" to PENDING / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'pending_payment' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status "canceled" to VOIDED / UNFULFILLED with cancelledAt', () => {
    const result = transformOrder(makeOrder({ status: 'canceled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
    expect(result.cancelledAt).toBe('2024-01-16T08:30:00.000Z')
  })

  it('maps status "closed" to REFUNDED / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'closed' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps line items correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1')
    expect(li.productId).toBe('5')
    expect(li.title).toBe('Wireless Keyboard')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(li.sku).toBe('PROD-001')
  })

  it('maps billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({
      line1: '123 Main Street',
      city: 'New York',
      region: 'NY',
      postalCode: '10001',
      country: 'US',
    })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toMatchObject({
      line1: '456 Oak Ave',
      city: 'Brooklyn',
    })
  })

  it('handles address1 as array', () => {
    const result = transformOrder(
      makeOrder({ billing_address: makeAddress({ address1: ['123 Main', 'Apt 4B'] }) }),
    )
    expect(result.billingAddress?.line1).toBe('123 Main, Apt 4B')
  })

  it('handles missing addresses gracefully', () => {
    const result = transformOrder(
      makeOrder({ billing_address: null, shipping_address: null }),
    )
    expect(result.billingAddress).toBeUndefined()
    expect(result.shippingAddress).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-16T08:30:00.000Z')
  })

  it('defaults currency to USD when order_currency_code is missing', () => {
    const result = transformOrder(makeOrder({ order_currency_code: null, currency_code: null }))
    expect(result.currency).toBe('USD')
    expect(result.totalPrice!.currency).toBe('USD')
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

  it('handles empty items array', () => {
    const result = transformOrder(makeOrder({ items: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('uses increment_id as orderNumber and builds name', () => {
    const result = transformOrder(makeOrder({ increment_id: '100000042' }))
    expect(result.orderNumber).toBe('100000042')
    expect(result.name).toBe('#100000042')
  })
})
