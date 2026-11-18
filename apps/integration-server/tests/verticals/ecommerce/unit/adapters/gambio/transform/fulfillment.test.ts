import { describe, it, expect } from 'vitest'
import { transformFulfillment } from '../../../../../../../src/verticals/ecommerce/adapters/gambio/transform/fulfillment'
import type { RawWooCommerceOrder } from '../../../../../../../src/verticals/ecommerce/adapters/gambio/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrder(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 1001,
    status: 'completed',
    line_items: [{ id: 9001, name: 'Blue Widget', quantity: 2 }],
    date_completed_gmt: '2024-03-05T00:00:00Z',
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-03-05T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (Gambio / WooCommerce)', () => {
  it('synthesises id and maps orderId for completed order', () => {
    const result = transformFulfillment(makeOrder())
    expect(result).not.toBeUndefined()
    expect(result!.id).toBe('1001:fulfillment')
    expect(result!.orderId).toBe('1001')
  })

  it('maps fulfillment status from WC order status', () => {
    expect(transformFulfillment(makeOrder({ status: 'completed' }))!.status).toBe('SUCCESS')
    expect(transformFulfillment(makeOrder({ status: 'processing' }))!.status).toBe('OPEN')
    expect(transformFulfillment(makeOrder({ status: 'on-hold' }))!.status).toBe('OPEN')
    expect(transformFulfillment(makeOrder({ status: 'cancelled' }))!.status).toBe('CANCELLED')
    expect(transformFulfillment(makeOrder({ status: 'refunded' }))!.status).toBe('CANCELLED')
  })

  it('returns undefined for pending (non-fulfillable) status', () => {
    const result = transformFulfillment(makeOrder({ status: 'pending' }))
    expect(result).toBeUndefined()
  })

  it('maps line items from order', () => {
    const result = transformFulfillment(makeOrder())!
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({ lineItemId: '9001', quantity: 2 })
  })

  it('extracts tracking info from meta_data', () => {
    const order = makeOrder({
      meta_data: [
        { key: 'tracking_number', value: 'TRACK99' },
        { key: 'tracking_provider', value: 'DHL' },
      ],
    })
    const result = transformFulfillment(order)!
    expect(result.trackingNumber).toBe('TRACK99')
    expect(result.carrier).toBe('DHL')
  })

  it('maps shippedAt from date_completed_gmt', () => {
    const result = transformFulfillment(makeOrder())!
    expect(result.shippedAt).toBe('2024-03-05T00:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformFulfillment(raw)!
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeOrder())!
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
