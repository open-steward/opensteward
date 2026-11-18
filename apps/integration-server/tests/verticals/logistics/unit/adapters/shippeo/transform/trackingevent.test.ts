import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type ShippeoMilestone,
} from '../../../../../../../src/verticals/logistics/adapters/shippeo/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeRaw(overrides: Partial<ShippeoMilestone> = {}): ShippeoMilestone {
  return {
    id: 'ms-001',
    event_code: 'IN_TRANSIT',
    status: 'IN_TRANSIT',
    description: 'Package departed facility',
    occurred_at: '2024-03-01T00:00:00Z',
    estimated_at: null,
    location: {
      city: 'Berlin',
      state: null,
      postal_code: '10115',
      country: 'DE',
      latitude: 52.52,
      longitude: 13.405,
    },
    ...overrides,
  }
}

describe('transformTrackingEvent', () => {
  it('maps id from milestone id', () => {
    expect(transformTrackingEvent(makeRaw()).id).toBe('ms-001')
  })

  it('maps trackingNumber from parameter', () => {
    expect(transformTrackingEvent(makeRaw(), 'TRK-001').trackingNumber).toBe('TRK-001')
  })

  it('maps shipmentId from parameter', () => {
    expect(transformTrackingEvent(makeRaw(), undefined, 'shp-001').shipmentId).toBe('shp-001')
  })

  it('maps carrierId from parameter', () => {
    expect(transformTrackingEvent(makeRaw(), undefined, undefined, 'DHL').carrierId).toBe('DHL')
  })

  it('defaults carrierId to shippeo when not provided', () => {
    expect(transformTrackingEvent(makeRaw()).carrierId).toBe('shippeo')
  })

  it('maps IN_TRANSIT status from event_code', () => {
    expect(transformTrackingEvent(makeRaw({ event_code: 'IN_TRANSIT' })).status).toBe('IN_TRANSIT')
  })

  it('maps DELIVERED status', () => {
    expect(transformTrackingEvent(makeRaw({ event_code: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps OUT_FOR_DELIVERY status', () => {
    expect(transformTrackingEvent(makeRaw({ event_code: 'OUT_FOR_DELIVERY' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps PRE_TRANSIT from PICKED_UP event_code', () => {
    expect(transformTrackingEvent(makeRaw({ event_code: 'PICKED_UP' })).status).toBe('PRE_TRANSIT')
  })

  it('falls back to status field when event_code absent', () => {
    expect(transformTrackingEvent(makeRaw({ event_code: null, status: 'DELIVERED' })).status).toBe(
      'DELIVERED',
    )
  })

  it('maps description', () => {
    expect(transformTrackingEvent(makeRaw()).description).toBe('Package departed facility')
  })

  it('maps location.city', () => {
    expect(transformTrackingEvent(makeRaw()).location?.city).toBe('Berlin')
  })

  it('maps location.postalCode from postal_code', () => {
    expect(transformTrackingEvent(makeRaw()).location?.postalCode).toBe('10115')
  })

  it('maps location.country', () => {
    expect(transformTrackingEvent(makeRaw()).location?.country).toBe('DE')
  })

  it('maps occurredAt from occurred_at', () => {
    expect(transformTrackingEvent(makeRaw()).occurredAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('falls back to estimated_at when occurred_at absent', () => {
    const result = transformTrackingEvent(
      makeRaw({ occurred_at: null, estimated_at: '2024-03-05T00:00:00Z' }),
    )
    expect(result.occurredAt).toEqual(new Date('2024-03-05T00:00:00Z'))
  })

  it('returns undefined location when location is null', () => {
    expect(transformTrackingEvent(makeRaw({ location: null })).location).toBeUndefined()
  })

  it('passes schema validation', () => {
    const result = transformTrackingEvent(makeRaw(), 'TRK-001', 'shp-001', 'DHL')
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformTrackingEvent(raw).metadata).toBe(raw)
  })
})
