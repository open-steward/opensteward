import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  mapFulfillmentStatus,
  type RawTikTokPackage,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiktok-shop/transform/fulfillment'
import type { RawTikTokOrder } from '../../../../../../../src/verticals/ecommerce/adapters/tiktok-shop/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrder(overrides: Partial<RawTikTokOrder> = {}): RawTikTokOrder {
  return {
    id: '577248495826001',
    status: 'IN_TRANSIT',
    line_items: [
      { id: 'li-001', product_id: 'prod-001' },
      { id: 'li-002', product_id: 'prod-001' },
    ],
    create_time: 1704067200,
    update_time: 1706745600,
    rts_time: 1706745600,
    ...overrides,
  }
}

function makePackage(overrides: Partial<RawTikTokPackage> = {}): RawTikTokPackage {
  return {
    id: 'pkg-001',
    tracking_number: 'TTS1234567890',
    shipping_provider_name: 'TikTok Shipping',
    ...overrides,
  }
}

describe('transformFulfillment (TikTok Shop)', () => {
  it('builds id from order_id:package_id', () => {
    const result = transformFulfillment(makeOrder(), makePackage())
    expect(result.id).toBe('577248495826001:pkg-001')
    expect(result.orderId).toBe('577248495826001')
  })

  it('falls back to shipping suffix when no package', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.id).toBe('577248495826001:shipping')
  })

  it('maps In Transit to SUCCESS', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps Awaiting Shipment to OPEN', () => {
    const result = transformFulfillment(makeOrder({ status: 'AWAITING_SHIPMENT' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps Cancelled to CANCELLED', () => {
    const result = transformFulfillment(makeOrder({ status: 'CANCELLED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('extracts tracking info from package', () => {
    const result = transformFulfillment(makeOrder(), makePackage())
    expect(result.trackingNumber).toBe('TTS1234567890')
    expect(result.carrier).toBe('TikTok Shipping')
  })

  it('leaves tracking undefined when no package', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.trackingNumber).toBeUndefined()
    expect(result.carrier).toBeUndefined()
  })

  it('includes line items from the order', () => {
    const result = transformFulfillment(makeOrder())
    // Each TikTok line item is one unit, so two units are two lines of 1.
    expect(result.lineItems).toEqual([
      { lineItemId: 'li-001', quantity: 1 },
      { lineItemId: 'li-002', quantity: 1 },
    ])
  })

  it('sets shippedAt from rts_time', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.shippedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('omits shippedAt when the order has no rts_time', () => {
    const result = transformFulfillment(
      makeOrder({ status: 'AWAITING_SHIPMENT', rts_time: undefined }),
    )
    expect(result.shippedAt).toBeUndefined()
  })

  it('satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeOrder(), makePackage())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('mapFulfillmentStatus (TikTok Shop)', () => {
  it('returns unknown for an absent or undocumented status', () => {
    expect(mapFulfillmentStatus(undefined)).toBe('unknown')
    expect(mapFulfillmentStatus('SOMETHING_NEW')).toBe('unknown')
  })

  it('returns PENDING for UNPAID', () => {
    expect(mapFulfillmentStatus('UNPAID')).toBe('PENDING')
  })

  it('returns SUCCESS for COMPLETED', () => {
    expect(mapFulfillmentStatus('COMPLETED')).toBe('SUCCESS')
  })
})
