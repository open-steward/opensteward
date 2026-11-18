import { describe, it, expect } from 'vitest'
import { transformTrackingEvent } from '../../../../../../../src/verticals/logistics/adapters/shipday/transform/trackingevent'
import type { ShipdayOrder } from '../../../../../../../src/verticals/logistics/adapters/shipday/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeOrder(overrides: Partial<ShipdayOrder> = {}): ShipdayOrder {
  return {
    orderId: 2001,
    orderNumber: 'SD-ORD-002',
    status: 'DELIVERED',
    deliveryTime: '2024-03-01T12:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T12:30:00Z',
    ...overrides,
  }
}

describe('transformTrackingEvent (shipday re-export)', () => {
  it('is a function (re-export from tracking.ts is valid)', () => {
    expect(typeof transformTrackingEvent).toBe('function')
  })

  it('always returns exactly one synthesised event', () => {
    expect(transformTrackingEvent(makeOrder())).toHaveLength(1)
  })

  it('maps shipmentId from orderId (string-coerced)', () => {
    expect(transformTrackingEvent(makeOrder())[0].shipmentId).toBe('2001')
  })

  it('maps status: DELIVERED → DELIVERED', () => {
    expect(transformTrackingEvent(makeOrder({ status: 'DELIVERED' })).at(0)!.status).toBe(
      'DELIVERED',
    )
  })

  it('maps occurredAt as Date', () => {
    expect(transformTrackingEvent(makeOrder()).at(0)!.occurredAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    const event = transformTrackingEvent(makeOrder()).at(0)!
    expect(() => TrackingEventSchema.parse(event)).not.toThrow()
  })
})
