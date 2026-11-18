import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  mapFulfillmentStatus,
  type RawTokopediaShippingInfo,
} from '../../../../../../../src/verticals/ecommerce/adapters/tokopedia/transform/fulfillment'
import type { RawTokopediaOrder } from '../../../../../../../src/verticals/ecommerce/adapters/tokopedia/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrder(overrides: Partial<RawTokopediaOrder> = {}): RawTokopediaOrder {
  return {
    order_id: 123456789,
    order_status: 500,
    products: [
      {
        id: 987654321,
        name: 'Batik Silk Shirt',
        quantity: 2,
      },
    ],
    shipment_fulfillment: {
      logistic_name: 'GoSend',
      logistic_service: 'Same Day',
      awb: 'GS-12345678',
    },
    create_time: '2024-05-01T12:00:00.000Z',
    ...overrides,
  }
}

function makeShipping(overrides: Partial<RawTokopediaShippingInfo> = {}): RawTokopediaShippingInfo {
  return {
    order_id: 123456789,
    awb: 'GS-12345678',
    logistic_name: 'GoSend',
    logistic_service: 'Same Day',
    shipping_date: '2024-05-01T14:00:00.000Z',
    delivered_date: '2024-05-01T16:00:00.000Z',
    ...overrides,
  }
}

describe('transformFulfillment (Tokopedia)', () => {
  it('generates synthetic fulfillment id from order_id', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.id).toBe('123456789:shipping')
    expect(result.orderId).toBe('123456789')
  })

  it('maps order status 500 to SUCCESS', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.status).toBe('SUCCESS')
  })

  it('uses shipping info for tracking when available', () => {
    const result = transformFulfillment(makeOrder(), makeShipping())
    expect(result.trackingNumber).toBe('GS-12345678')
    expect(result.carrier).toBe('GoSend')
    expect(result.service).toBe('Same Day')
    expect(result.shippedAt).toBe('2024-05-01T14:00:00.000Z')
    expect(result.deliveredAt).toBe('2024-05-01T16:00:00.000Z')
  })

  it('falls back to order shipment info when no shipping data', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.trackingNumber).toBe('GS-12345678')
    expect(result.carrier).toBe('GoSend')
    expect(result.service).toBe('Same Day')
  })

  it('includes line items from order products', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({
      lineItemId: '987654321',
      quantity: 2,
    })
  })

  it('preserves createdAt from order', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.createdAt).toBe('2024-05-01T12:00:00.000Z')
  })

  it('satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeOrder(), makeShipping())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('maps cancelled order to CANCELLED', () => {
    const result = transformFulfillment(makeOrder({ order_status: 0 }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps pending order (100) to PENDING', () => {
    const result = transformFulfillment(makeOrder({ order_status: 100 }))
    expect(result.status).toBe('PENDING')
  })

  it('maps accepted order (400) to OPEN', () => {
    const result = transformFulfillment(makeOrder({ order_status: 400 }))
    expect(result.status).toBe('OPEN')
  })

  it('handles empty products', () => {
    const result = transformFulfillment(makeOrder({ products: [] }))
    expect(result.lineItems).toBeUndefined()
  })
})

describe('mapFulfillmentStatus (Tokopedia)', () => {
  it('maps all known status ranges', () => {
    expect(mapFulfillmentStatus(0)).toBe('CANCELLED')
    expect(mapFulfillmentStatus(10)).toBe('CANCELLED')
    expect(mapFulfillmentStatus(100)).toBe('PENDING')
    expect(mapFulfillmentStatus(220)).toBe('PENDING')
    expect(mapFulfillmentStatus(400)).toBe('OPEN')
    expect(mapFulfillmentStatus(450)).toBe('OPEN')
    expect(mapFulfillmentStatus(500)).toBe('SUCCESS')
    expect(mapFulfillmentStatus(600)).toBe('SUCCESS')
    expect(mapFulfillmentStatus(700)).toBe('SUCCESS')
  })

  it('returns PENDING for undefined', () => {
    expect(mapFulfillmentStatus(undefined)).toBe('PENDING')
  })
})
