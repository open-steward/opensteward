import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type GoshareDelivery,
} from '../../../../../../../src/verticals/logistics/adapters/goshare/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeDelivery(overrides: Partial<GoshareDelivery> = {}): GoshareDelivery {
  return {
    id: 'delivery-001',
    status: 'in_transit',
    tracking_number: 'TRK-GOSHARE-001',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    ...overrides,
  }
}

describe('goshare transformTracking', () => {
  it('always returns exactly one event', () => {
    expect(transformTracking(makeDelivery())).toHaveLength(1)
  })

  it('maps shipmentId to raw id', () => {
    const [event] = transformTracking(makeDelivery())
    expect(event.shipmentId).toBe('delivery-001')
  })

  it('maps trackingNumber from tracking_number field', () => {
    const [event] = transformTracking(makeDelivery())
    expect(event.trackingNumber).toBe('TRK-GOSHARE-001')
  })

  it('falls back to id when tracking_number is null', () => {
    const [event] = transformTracking(makeDelivery({ tracking_number: null }))
    expect(event.trackingNumber).toBe('delivery-001')
  })

  it('sets carrierId to goshare', () => {
    const [event] = transformTracking(makeDelivery())
    expect(event.carrierId).toBe('goshare')
  })

  it('maps occurredAt as Date', () => {
    const [event] = transformTracking(makeDelivery())
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    const [event] = transformTracking(makeDelivery())
    expect(() => TrackingEventSchema.parse(event)).not.toThrow()
  })

  it('maps status strings to canonical TrackingEventStatus values', () => {
    const cases: Array<[string, string]> = [
      ['pending', 'PRE_TRANSIT'],
      ['created', 'PRE_TRANSIT'],
      ['searching_driver', 'PRE_TRANSIT'],
      ['driver_assigned', 'IN_TRANSIT'],
      ['picked_up', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['arriving_soon', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['completed', 'DELIVERED'],
      ['returned', 'RETURN_TO_SENDER'],
      ['return_to_sender', 'RETURN_TO_SENDER'],
      ['cancelled', 'FAILURE'],
      ['canceled', 'FAILURE'],
      ['failed', 'FAILURE'],
      ['undeliverable', 'FAILURE'],
      ['something_random', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const [event] = transformTracking(makeDelivery({ status }))
      expect(event.status).toBe(expected)
    }
  })

  it('handles null status as UNKNOWN', () => {
    const [event] = transformTracking(makeDelivery({ status: null }))
    expect(event.status).toBe('UNKNOWN')
  })

  it('includes metadata on the event', () => {
    const raw = makeDelivery()
    const [event] = transformTracking(raw)
    expect(event.metadata).toBe(raw)
  })
})
