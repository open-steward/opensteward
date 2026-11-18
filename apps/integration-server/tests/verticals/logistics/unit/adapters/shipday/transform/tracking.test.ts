import { describe, it, expect } from 'vitest'
import { transformTracking } from '../../../../../../../src/verticals/logistics/adapters/shipday/transform/tracking'
import type { ShipdayOrder } from '../../../../../../../src/verticals/logistics/adapters/shipday/transform/order'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeOrder(overrides: Partial<ShipdayOrder> = {}): ShipdayOrder {
  return {
    orderId: 1001,
    orderNumber: 'SD-ORD-001',
    status: 'OUT_FOR_DELIVERY',
    deliveryTime: '2024-03-01T10:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformTracking (shipday)', () => {
  it('always returns exactly one synthesised event', () => {
    expect(transformTracking(makeOrder())).toHaveLength(1)
  })

  it('maps shipmentId from orderId (string-coerced)', () => {
    expect(transformTracking(makeOrder())[0].shipmentId).toBe('1001')
  })

  it('maps trackingNumber from orderNumber', () => {
    expect(transformTracking(makeOrder())[0].trackingNumber).toBe('SD-ORD-001')
  })

  it('carrierId is always shipday', () => {
    expect(transformTracking(makeOrder())[0].carrierId).toBe('shipday')
  })

  it('maps status: OUT_FOR_DELIVERY → OUT_FOR_DELIVERY', () => {
    expect(transformTracking(makeOrder({ status: 'OUT_FOR_DELIVERY' })).at(0)!.status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps description from raw status string', () => {
    expect(transformTracking(makeOrder({ status: 'OUT_FOR_DELIVERY' })).at(0)!.description).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps occurredAt preferring deliveryTime', () => {
    expect(transformTracking(makeOrder()).at(0)!.occurredAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeOrder()
    expect(transformTracking(raw).at(0)!.metadata).toBe(raw)
  })

  it('maps all tracking statuses correctly', () => {
    const cases: [string, string][] = [
      ['ASSIGNED', 'PRE_TRANSIT'],
      ['ACCEPTED', 'PRE_TRANSIT'],
      ['AWAITING', 'PRE_TRANSIT'],
      ['READY_TO_SHIP', 'PRE_TRANSIT'],
      ['STARTED', 'IN_TRANSIT'],
      ['PICKED_UP', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['CANCELLED', 'FAILURE'],
      ['CANCELED', 'FAILURE'],
      ['FAILED', 'FAILURE'],
      ['UNKNOWN_STATUS', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformTracking(makeOrder({ status })).at(0)!.status).toBe(expected)
    }
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    const event = transformTracking(makeOrder()).at(0)!
    expect(() => TrackingEventSchema.parse(event)).not.toThrow()
  })
})
