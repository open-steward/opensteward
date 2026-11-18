import { describe, it, expect } from 'vitest'
import {
  transformTrackingInformation,
  type ShipEngineTrackingInformation,
  type ShipEngineTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/shipengine/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTrackingEvent(
  overrides: Partial<ShipEngineTrackingEvent> = {},
): ShipEngineTrackingEvent {
  return {
    occurred_at: '2024-03-01T00:00:00Z',
    description: 'Departed facility',
    status_code: 'IT',
    status_description: 'In Transit',
    city_locality: 'Louisville',
    state_province: 'KY',
    country_code: 'US',
    postal_code: '40213',
    ...overrides,
  }
}

function makeTracking(
  overrides: Partial<ShipEngineTrackingInformation> = {},
): ShipEngineTrackingInformation {
  return {
    tracking_number: '1Z999AA10123456784',
    status_code: 'IT',
    status_description: 'In Transit',
    ship_date: '2024-03-01T00:00:00Z',
    events: [makeTrackingEvent()],
    ...overrides,
  }
}

describe('transformTrackingInformation (shipengine)', () => {
  it('produces one event per events entry', () => {
    expect(transformTrackingInformation(makeTracking())).toHaveLength(1)
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformTrackingInformation(makeTracking())[0].trackingNumber).toBe(
      '1Z999AA10123456784',
    )
  })

  it('maps status: IT → IN_TRANSIT', () => {
    expect(transformTrackingInformation(makeTracking())[0].status).toBe('IN_TRANSIT')
  })

  it('maps description from event description', () => {
    expect(transformTrackingInformation(makeTracking())[0].description).toBe('Departed facility')
  })

  it('maps location fields from event', () => {
    const event = transformTrackingInformation(makeTracking())[0]
    expect(event.location?.city).toBe('Louisville')
    expect(event.location?.state).toBe('KY')
    expect(event.location?.country).toBe('US')
    expect(event.location?.postalCode).toBe('40213')
  })

  it('maps occurredAt as Date from occurred_at', () => {
    expect(transformTrackingInformation(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('maps createdAt as Date from ship_date', () => {
    expect(transformTrackingInformation(makeTracking())[0].createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeTracking()
    expect(transformTrackingInformation(raw)[0].metadata).toBe(raw)
  })

  it('synthesises a single summary event when events is empty', () => {
    const raw = makeTracking({ events: [] })
    const events = transformTrackingInformation(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
    expect(events[0].description).toBe('In Transit')
  })

  it('maps all ShipEngine status codes correctly', () => {
    const cases: [string, string][] = [
      ['UN', 'UNKNOWN'],
      ['AC', 'PRE_TRANSIT'],
      ['IT', 'IN_TRANSIT'],
      ['OD', 'OUT_FOR_DELIVERY'],
      ['DE', 'DELIVERED'],
      ['AT', 'AVAILABLE_FOR_PICKUP'],
      ['NT', 'IN_TRANSIT'],
      ['EX', 'FAILURE'],
      ['AN', 'RETURN_TO_SENDER'],
      ['ZZ', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const raw = makeTracking({ events: [makeTrackingEvent({ status_code: code })] })
      expect(transformTrackingInformation(raw)[0].status).toBe(expected)
    }
  })

  it('omits location when all location fields are absent', () => {
    const raw = makeTracking({
      events: [
        makeTrackingEvent({
          city_locality: null,
          state_province: null,
          country_code: null,
          postal_code: null,
        }),
      ],
    })
    expect(transformTrackingInformation(raw)[0].location).toBeUndefined()
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    for (const event of transformTrackingInformation(makeTracking())) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
