import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type XCartOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/xcart/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShippedOrder(overrides: Partial<XCartOrder> = {}): XCartOrder {
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
      {
        item_id: 2,
        product_id: 456,
        name: 'Mouse Pad',
        qty: 1,
        price: 9.99,
        sku: 'MPAD-001',
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
    },
    billing_address: null,
    ...overrides,
  }
}

describe('transformFulfillment (X-Cart)', () => {
  it('synthesises fulfillment id from order id', () => {
    const result = transformFulfillment(makeShippedOrder())
    expect(result.id).toBe('456-fulfillment')
  })

  it('carries the correct orderId', () => {
    const result = transformFulfillment(makeShippedOrder())
    expect(result.orderId).toBe('456')
  })

  it('maps shipping_status Shipped → SUCCESS fulfillment status', () => {
    const result = transformFulfillment(makeShippedOrder({ shipping_status: 'Shipped' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps shipping_status Delivered → SUCCESS fulfillment status', () => {
    const result = transformFulfillment(makeShippedOrder({ shipping_status: 'Delivered' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps shipping_status Processing → OPEN fulfillment status', () => {
    const result = transformFulfillment(makeShippedOrder({ shipping_status: 'Processing' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps shipping_status New → OPEN fulfillment status', () => {
    const result = transformFulfillment(makeShippedOrder({ shipping_status: 'New' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps shipping_status Cancelled → CANCELLED fulfillment status', () => {
    const result = transformFulfillment(makeShippedOrder({ shipping_status: 'Cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps tracking number', () => {
    const result = transformFulfillment(makeShippedOrder())
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
  })

  it('maps shipping method as carrier', () => {
    const result = transformFulfillment(makeShippedOrder())
    expect(result.carrier).toBe('UPS Ground')
  })

  it('maps line items with quantity', () => {
    const result = transformFulfillment(makeShippedOrder())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toMatchObject({ lineItemId: '1', quantity: 2 })
    expect(result.lineItems![1]).toMatchObject({ lineItemId: '2', quantity: 1 })
  })

  it('converts unix timestamp to ISO shippedAt', () => {
    const result = transformFulfillment(makeShippedOrder())
    expect(result.shippedAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('handles null tracking number gracefully', () => {
    const result = transformFulfillment(
      makeShippedOrder({ shipping_tracking_number: null }),
    )
    expect(result.trackingNumber).toBeUndefined()
  })

  it('handles missing shipping method gracefully', () => {
    const result = transformFulfillment(makeShippedOrder({ shipping_method: null }))
    expect(result.carrier).toBeUndefined()
  })

  it('handles order with no items', () => {
    const result = transformFulfillment(makeShippedOrder({ items: [] }))
    expect(result.lineItems).toEqual([])
  })

  it('preserves raw order in metadata', () => {
    const raw = makeShippedOrder()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShippedOrder())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('defaults to PENDING status when shipping_status is absent', () => {
    const result = transformFulfillment(makeShippedOrder({ shipping_status: null }))
    expect(result.status).toBe('PENDING')
  })
})
