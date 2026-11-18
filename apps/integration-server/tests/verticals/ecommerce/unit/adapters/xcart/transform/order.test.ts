import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type XCartOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/xcart/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<XCartOrder> = {}): XCartOrder {
  return {
    order_id: 456,
    order_number: '0456',
    date: 1704067200, // 2024-01-01T00:00:00Z
    status: 'Processed',
    payment_status: 'Paid',
    shipping_status: 'Shipped',
    total: 59.98,
    currency: 'USD',
    customer: {
      profile_id: 789,
      email: 'john.doe@example.com',
      firstname: 'John',
      lastname: 'Doe',
    },
    items: [
      {
        item_id: 1,
        product_id: 123,
        name: 'Wireless Keyboard',
        qty: 2,
        price: 29.99,
        sku: 'PROD-001',
      },
    ],
    shipping_tracking_number: '1Z999AA10123456784',
    shipping_method: 'UPS Ground',
    shipping_address: {
      firstname: 'John',
      lastname: 'Doe',
      street: '123 Main Street',
      city: 'New York',
      state: 'NY',
      zipcode: '10001',
      country: 'US',
      phone: '+1 555 000 1234',
    },
    billing_address: {
      firstname: 'John',
      lastname: 'Doe',
      street: '123 Main Street',
      city: 'New York',
      state: 'NY',
      zipcode: '10001',
      country: 'US',
      phone: '+1 555 000 1234',
    },
    ...overrides,
  }
}

describe('transformOrder (X-Cart)', () => {
  it('maps core fields and stringifies order id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('456')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('0456')
    expect(result.name).toBe('#0456')
    expect(result.customerId).toBe('789')
    expect(result.email).toBe('john.doe@example.com')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 5998, currency: 'USD' })
  })

  it('uses order_id in name when order_number is absent', () => {
    const result = transformOrder(makeOrder({ order_number: null }))
    expect(result.name).toBe('#456')
    expect(result.orderNumber).toBeUndefined()
  })

  it('converts unix timestamp to ISO createdAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('maps payment_status Paid → PAID financial status', () => {
    expect(transformOrder(makeOrder({ payment_status: 'Paid' })).financialStatus).toBe('PAID')
  })

  it('maps payment_status Awaiting → PENDING financial status', () => {
    expect(transformOrder(makeOrder({ payment_status: 'Awaiting' })).financialStatus).toBe('PENDING')
  })

  it('maps payment_status Declined → VOIDED financial status', () => {
    expect(transformOrder(makeOrder({ payment_status: 'Declined' })).financialStatus).toBe('VOIDED')
  })

  it('maps payment_status Refunded → REFUNDED financial status', () => {
    expect(transformOrder(makeOrder({ payment_status: 'Refunded' })).financialStatus).toBe('REFUNDED')
  })

  it('maps shipping_status Shipped → FULFILLED fulfillment status', () => {
    expect(transformOrder(makeOrder({ shipping_status: 'Shipped' })).fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps shipping_status New → UNFULFILLED fulfillment status', () => {
    expect(transformOrder(makeOrder({ shipping_status: 'New' })).fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps shipping_status Delivered → FULFILLED fulfillment status', () => {
    expect(transformOrder(makeOrder({ shipping_status: 'Delivered' })).fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps line items correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1')
    expect(li.productId).toBe('123')
    expect(li.title).toBe('Wireless Keyboard')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(li.sku).toBe('PROD-001')
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toMatchObject({
      line1: '123 Main Street',
      city: 'New York',
      region: 'NY',
      postalCode: '10001',
      country: 'US',
    })
  })

  it('maps billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toMatchObject({
      line1: '123 Main Street',
      city: 'New York',
    })
  })

  it('handles missing addresses gracefully', () => {
    const result = transformOrder(
      makeOrder({ shipping_address: null, billing_address: null }),
    )
    expect(result.shippingAddress).toBeUndefined()
    expect(result.billingAddress).toBeUndefined()
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

  it('handles order with empty items array', () => {
    const result = transformOrder(makeOrder({ items: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('defaults currency to USD when missing', () => {
    const result = transformOrder(makeOrder({ currency: null }))
    expect(result.currency).toBe('USD')
    expect(result.totalPrice!.currency).toBe('USD')
  })
})
