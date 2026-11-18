import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type TopshipTracking,
} from '../../../../../../../src/verticals/logistics/adapters/topship/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTracking(overrides: Partial<TopshipTracking> = {}): TopshipTracking {
  return {
    id: 'ts-001',
    trackingId: 'TTRK001',
    status: 'InTransit',
    message: 'Package in transit to destination',
    itemLocation: 'Lagos Hub',
    createdDate: '2024-03-01T00:00:00Z',
    updatedDate: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('topship transformTracking', () => {
  it('returns exactly one event (snapshot model)', () => {
    const r = transformTracking(makeTracking())
    expect(r).toHaveLength(1)
  })

  it('maps id → shipmentId', () => {
    const r = transformTracking(makeTracking())
    expect(r[0].shipmentId).toBe('ts-001')
  })

  it('maps trackingId → trackingNumber', () => {
    const r = transformTracking(makeTracking())
    expect(r[0].trackingNumber).toBe('TTRK001')
  })

  it('maps InTransit → IN_TRANSIT', () => {
    const r = transformTracking(makeTracking())
    expect(r[0].status).toBe('IN_TRANSIT')
  })

  it('maps message → description', () => {
    const r = transformTracking(makeTracking())
    expect(r[0].description).toBe('Package in transit to destination')
  })

  it('maps itemLocation → location.street1', () => {
    const r = transformTracking(makeTracking())
    expect(r[0].location?.street1).toBe('Lagos Hub')
  })

  it('maps updatedDate → occurredAt as Date', () => {
    const r = transformTracking(makeTracking())
    expect(r[0].occurredAt).toBeInstanceOf(Date)
    expect(r[0].occurredAt?.toISOString()).toBe('2024-03-02T00:00:00.000Z')
  })

  it('falls back to createdDate for occurredAt when updatedDate absent', () => {
    const r = transformTracking(makeTracking({ updatedDate: null }))
    expect(r[0].occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps status values correctly', () => {
    const cases: Array<[string, string]> = [
      ['delivered', 'DELIVERED'],
      ['OutForDelivery', 'OUT_FOR_DELIVERY'],
      ['intransit', 'IN_TRANSIT'],
      ['PickedUp', 'IN_TRANSIT'],
      ['AwaitingPickup', 'PRE_TRANSIT'],
      // awaiting_drop_off → 'awaitingdropoff' after strip: contains 'dropoff' but not 'pickup' → UNKNOWN
      ['awaiting_drop_off', 'UNKNOWN'],
      ['Confirmed', 'PRE_TRANSIT'],
      ['pending', 'PRE_TRANSIT'],
      ['DeliveryFailed', 'FAILURE'],
      ['bogus', 'UNKNOWN'],
    ]
    for (const [s, expected] of cases) {
      const r = transformTracking(makeTracking({ status: s }))
      expect(r[0].status, `status: ${s}`).toBe(expected)
    }
  })

  it('metadata references the raw object', () => {
    const raw = makeTracking()
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTracking(makeTracking())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('handles null itemLocation → no location', () => {
    const r = transformTracking(makeTracking({ itemLocation: null }))
    expect(r[0].location).toBeUndefined()
    expect(() => TrackingEventSchema.parse(r[0])).not.toThrow()
  })
})
