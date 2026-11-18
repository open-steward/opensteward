import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  mapFulfillmentStatus,
  type RawShopeeTrackingInfo,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopee/transform/fulfillment'
import type { RawShopeeOrder } from '../../../../../../../src/verticals/ecommerce/adapters/shopee/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrder(overrides: Partial<RawShopeeOrder> = {}): RawShopeeOrder {
  return {
    order_sn: 'SG240501ABCDE',
    order_status: 'SHIPPED',
    item_list: [
      {
        item_id: 100200300,
        item_name: 'Earbuds',
        model_quantity_purchased: 2,
        order_item_id: 7001,
      },
      {
        item_id: 100200301,
        item_name: 'Case',
        model_quantity_purchased: 1,
        order_item_id: 7002,
      },
    ],
    create_time: 1714560000,
    update_time: 1714646400,
    ...overrides,
  }
}

const TRACKING: RawShopeeTrackingInfo = {
  tracking_number: 'SG123456789',
  shipping_carrier: 'J&T Express',
  logistics_channel_name: 'J&T Express (SG)',
}

describe('transformFulfillment (Shopee)', () => {
  it('builds a synthetic fulfillment id from order_sn', () => {
    const result = transformFulfillment(makeOrder(), TRACKING)
    expect(result.id).toBe('SG240501ABCDE:shipping')
    expect(result.orderId).toBe('SG240501ABCDE')
  })

  it('maps SHIPPED order status to SUCCESS fulfillment status', () => {
    const result = transformFulfillment(makeOrder(), TRACKING)
    expect(result.status).toBe('SUCCESS')
  })

  it('maps READY_TO_SHIP to OPEN', () => {
    const result = transformFulfillment(
      makeOrder({ order_status: 'READY_TO_SHIP' }),
    )
    expect(result.status).toBe('OPEN')
  })

  it('maps CANCELLED to CANCELLED', () => {
    const result = transformFulfillment(
      makeOrder({ order_status: 'CANCELLED' }),
    )
    expect(result.status).toBe('CANCELLED')
  })

  it('surfaces tracking number and carrier from logistics info', () => {
    const result = transformFulfillment(makeOrder(), TRACKING)
    expect(result.trackingNumber).toBe('SG123456789')
    expect(result.carrier).toBe('J&T Express')
  })

  it('builds line items from order items', () => {
    const result = transformFulfillment(makeOrder(), TRACKING)
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: '7001', quantity: 2 })
    expect(result.lineItems![1]).toEqual({ lineItemId: '7002', quantity: 1 })
  })

  it('handles missing tracking gracefully', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.trackingNumber).toBeUndefined()
    expect(result.carrier).toBeUndefined()
  })

  it('sets shippedAt for SHIPPED orders', () => {
    const result = transformFulfillment(makeOrder(), TRACKING)
    expect(result.shippedAt).toBeTruthy()
  })

  it('satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeOrder(), TRACKING)
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('mapFulfillmentStatus (Shopee logistics)', () => {
  it('returns PENDING for UNPAID', () => {
    expect(mapFulfillmentStatus('UNPAID')).toBe('PENDING')
  })

  it('returns PENDING for undefined', () => {
    expect(mapFulfillmentStatus(undefined)).toBe('PENDING')
  })

  it('returns SUCCESS for COMPLETED', () => {
    expect(mapFulfillmentStatus('COMPLETED')).toBe('SUCCESS')
  })
})
