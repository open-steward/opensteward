import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type WakeoTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/wakeo/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeRaw(overrides: Partial<WakeoTrackingEvent> = {}): WakeoTrackingEvent {
  return {
    id: 'wakeo-evt-001',
    status: 'in_transit',
    description: 'Shipment in transit',
    location: {
      city: 'Paris',
      country: 'FR',
      postalCode: '75001',
    },
    occurredAt: '2024-03-01T00:00:00Z',
    transportMode: 'air',
    ...overrides,
  }
}

describe('transformTrackingEvent (wakeo)', () => {
  it('maps id from raw.id', () => {
    expect(transformTrackingEvent(makeRaw()).id).toBe('wakeo-evt-001')
  })

  it('passes through trackingNumber argument', () => {
    const result = transformTrackingEvent(makeRaw(), 'TRK-123')
    expect(result.trackingNumber).toBe('TRK-123')
  })

  it('maps status in_transit → IN_TRANSIT', () => {
    expect(transformTrackingEvent(makeRaw()).status).toBe('IN_TRANSIT')
  })

  it('maps status booked → PRE_TRANSIT', () => {
    expect(transformTrackingEvent(makeRaw({ status: 'booked' })).status).toBe('PRE_TRANSIT')
  })

  it('maps status departed → IN_TRANSIT', () => {
    expect(transformTrackingEvent(makeRaw({ status: 'departed' })).status).toBe('IN_TRANSIT')
  })

  it('maps status arrived → IN_TRANSIT', () => {
    expect(transformTrackingEvent(makeRaw({ status: 'arrived' })).status).toBe('IN_TRANSIT')
  })

  it('maps status out_for_delivery → OUT_FOR_DELIVERY', () => {
    expect(transformTrackingEvent(makeRaw({ status: 'out_for_delivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps status delivered → DELIVERED', () => {
    expect(transformTrackingEvent(makeRaw({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps status exception → FAILURE', () => {
    expect(transformTrackingEvent(makeRaw({ status: 'exception' })).status).toBe('FAILURE')
  })

  it('maps status customs_hold → FAILURE', () => {
    expect(transformTrackingEvent(makeRaw({ status: 'customs_hold' })).status).toBe('FAILURE')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformTrackingEvent(makeRaw({ status: 'something_weird' })).status).toBe('UNKNOWN')
  })

  it('maps undefined status → UNKNOWN', () => {
    expect(transformTrackingEvent(makeRaw({ status: undefined })).status).toBe('UNKNOWN')
  })

  it('maps description', () => {
    expect(transformTrackingEvent(makeRaw()).description).toBe('Shipment in transit')
  })

  it('maps location city, country, postalCode', () => {
    const result = transformTrackingEvent(makeRaw())
    expect(result.location?.city).toBe('Paris')
    expect(result.location?.country).toBe('FR')
    expect(result.location?.postalCode).toBe('75001')
  })

  it('returns undefined location when location has no address fields', () => {
    const result = transformTrackingEvent(makeRaw({ location: { portCode: 'CDG' } }))
    expect(result.location).toBeUndefined()
  })

  it('returns undefined location when location is absent', () => {
    const result = transformTrackingEvent(makeRaw({ location: undefined }))
    expect(result.location).toBeUndefined()
  })

  it('maps occurredAt to a Date instance', () => {
    expect(transformTrackingEvent(makeRaw()).occurredAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformTrackingEvent(raw).metadata).toBe(raw)
  })

  it('produces output that parses against TrackingEventSchema', () => {
    expect(() =>
      TrackingEventSchema.parse(transformTrackingEvent(makeRaw(), 'TRK-123')),
    ).not.toThrow()
  })
})
