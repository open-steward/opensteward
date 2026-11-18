import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type DeliverooTrackingRaw,
} from '../../../../../../../src/verticals/logistics/adapters/deliveroo/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTracking(overrides: Partial<DeliverooTrackingRaw> = {}): DeliverooTrackingRaw {
  return {
    id: 'del-track-001',
    order_id: 'ord-999',
    status: 'rider_in_transit',
    updated_at: '2024-03-01T13:00:00Z',
    created_at: '2024-03-01T12:00:00Z',
    location: { lat: 51.5074, lon: -0.1278 },
    ...overrides,
  }
}

describe('deliveroo transformTracking', () => {
  it('returns an array with one event', () => {
    const result = transformTracking(makeTracking())
    expect(result).toHaveLength(1)
  })

  it('uses order_id as shipmentId', () => {
    const result = transformTracking(makeTracking())
    expect(result[0].shipmentId).toBe('ord-999')
  })

  it('uses id as trackingNumber', () => {
    const result = transformTracking(makeTracking())
    expect(result[0].trackingNumber).toBe('del-track-001')
  })

  it('sets carrierId to deliveroo', () => {
    const result = transformTracking(makeTracking())
    expect(result[0].carrierId).toBe('deliveroo')
  })

  it('maps rider_in_transit to IN_TRANSIT', () => {
    const result = transformTracking(makeTracking())
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps delivered to DELIVERED', () => {
    const result = transformTracking(makeTracking({ status: 'delivered' }))
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps rider_nearby to OUT_FOR_DELIVERY', () => {
    const result = transformTracking(makeTracking({ status: 'rider_nearby' }))
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps pending/placed/accepted/confirmed to PRE_TRANSIT', () => {
    for (const s of ['pending', 'placed', 'accepted', 'confirmed']) {
      expect(transformTracking(makeTracking({ status: s }))[0].status).toBe('PRE_TRANSIT')
    }
  })

  it('maps canceled/rejected/undeliverable to FAILURE', () => {
    for (const s of ['canceled', 'rejected', 'undeliverable']) {
      expect(transformTracking(makeTracking({ status: s }))[0].status).toBe('FAILURE')
    }
  })

  it('maps updated_at to occurredAt', () => {
    const result = transformTracking(makeTracking())
    expect(result[0].occurredAt).toBeInstanceOf(Date)
    expect(result[0].occurredAt?.toISOString()).toBe('2024-03-01T13:00:00.000Z')
  })

  it('falls back to created_at when updated_at absent', () => {
    const result = transformTracking(makeTracking({ updated_at: null }))
    expect(result[0].occurredAt?.toISOString()).toBe('2024-03-01T12:00:00.000Z')
  })

  it('builds location from lat/lon', () => {
    const result = transformTracking(makeTracking())
    expect(result[0].location).toBeDefined()
  })

  it('omits location when no lat/lon', () => {
    const result = transformTracking(makeTracking({ location: null }))
    expect(result[0].location).toBeUndefined()
  })

  it('passes schema validation', () => {
    const result = transformTracking(makeTracking())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })
})
