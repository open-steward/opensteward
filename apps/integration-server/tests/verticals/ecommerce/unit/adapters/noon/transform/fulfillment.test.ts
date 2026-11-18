import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  mapFulfillmentStatus,
  type RawNoonFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/noon/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(overrides: Partial<RawNoonFulfillment> = {}): RawNoonFulfillment {
  return {
    fulfillment_id: 'FF-5001',
    order_id: 'ORD-98765',
    status: 'shipped',
    tracking_number: 'NOON-TRK-123456',
    tracking_url: 'https://tracking.noon.com/NOON-TRK-123456',
    carrier: 'Noon Express',
    service_type: 'standard',
    items: [
      { order_item_id: 'OI-111', sku: 'SKU-BUDS-BLK', quantity: 2 },
    ],
    shipped_at: '2024-07-02T10:00:00Z',
    estimated_delivery_at: '2024-07-04T18:00:00Z',
    created_at: '2024-07-01T14:00:00Z',
    updated_at: '2024-07-02T10:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (Noon)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.id).toBe('FF-5001')
    expect(result.orderId).toBe('ORD-98765')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('NOON-TRK-123456')
    expect(result.trackingUrl).toBe('https://tracking.noon.com/NOON-TRK-123456')
    expect(result.carrier).toBe('Noon Express')
    expect(result.service).toBe('standard')
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({
      lineItemId: 'OI-111',
      quantity: 2,
    })
  })

  it('maps timestamp fields', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(result.shippedAt).toBe('2024-07-02T10:00:00Z')
    expect(result.estimatedDeliveryAt).toBe('2024-07-04T18:00:00Z')
    expect(result.createdAt).toBe('2024-07-01T14:00:00Z')
    expect(result.updatedAt).toBe('2024-07-02T10:00:00Z')
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeFulfillment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw)
    expect(result.metadata['fulfillment_id']).toBe('FF-5001')
  })

  it('handles fulfillments with no items', () => {
    const result = transformFulfillment(makeFulfillment({ items: [] }))
    expect(result.lineItems).toBeUndefined()
  })
})

describe('transformFulfillments (Noon)', () => {
  it('returns empty array for undefined input', () => {
    expect(transformFulfillments(undefined)).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(transformFulfillments([])).toEqual([])
  })

  it('maps multiple fulfillments', () => {
    const fulfillments = transformFulfillments([
      makeFulfillment(),
      makeFulfillment({ fulfillment_id: 'FF-5002', status: 'pending' }),
    ])
    expect(fulfillments).toHaveLength(2)
    expect(fulfillments[0]!.id).toBe('FF-5001')
    expect(fulfillments[1]!.id).toBe('FF-5002')
    expect(fulfillments[1]!.status).toBe('PENDING')
  })
})

describe('mapFulfillmentStatus (Noon)', () => {
  it('maps all known statuses', () => {
    expect(mapFulfillmentStatus('pending')).toBe('PENDING')
    expect(mapFulfillmentStatus('picked')).toBe('OPEN')
    expect(mapFulfillmentStatus('packed')).toBe('OPEN')
    expect(mapFulfillmentStatus('ready_to_ship')).toBe('OPEN')
    expect(mapFulfillmentStatus('shipped')).toBe('SUCCESS')
    expect(mapFulfillmentStatus('delivered')).toBe('SUCCESS')
    expect(mapFulfillmentStatus('cancelled')).toBe('CANCELLED')
    expect(mapFulfillmentStatus('returned')).toBe('CANCELLED')
    expect(mapFulfillmentStatus('failed')).toBe('FAILURE')
  })

  it('returns PENDING for undefined or unknown status', () => {
    expect(mapFulfillmentStatus(undefined)).toBe('PENDING')
    expect(mapFulfillmentStatus('unknown')).toBe('PENDING')
  })
})
