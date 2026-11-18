import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type CargoOneTrackingResponse,
  type CargoOneTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/cargo-one/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<CargoOneTrackingEvent> = {}): CargoOneTrackingEvent {
  return {
    id: 'evt-001',
    status: 'in_transit',
    description: 'Shipment departed Frankfurt',
    location: {
      city: 'Frankfurt',
      state: 'HE',
      country_code: 'DE',
      postal_code: '60549',
    },
    occurred_at: '2024-03-01T08:00:00Z',
    created_at: '2024-03-01T08:05:00Z',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<CargoOneTrackingResponse> = {}): CargoOneTrackingResponse {
  return {
    id: 'track-001',
    shipment_id: 'cgo-shp-001',
    tracking_number: 'C1TRK123456',
    carrier_id: 'lufthansa_cargo',
    status: 'in_transit',
    events: [makeEvent()],
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTrackingEvents (cargo-one)', () => {
  it('maps one event per events entry', () => {
    expect(transformTrackingEvents(makeTracking())).toHaveLength(1)
  })

  it('maps carrierId from carrier_id on parent', () => {
    expect(transformTrackingEvents(makeTracking())[0].carrierId).toBe('lufthansa_cargo')
  })

  it('maps trackingNumber from parent', () => {
    expect(transformTrackingEvents(makeTracking())[0].trackingNumber).toBe('C1TRK123456')
  })

  it('maps shipmentId from parent', () => {
    expect(transformTrackingEvents(makeTracking())[0].shipmentId).toBe('cgo-shp-001')
  })

  it('maps id from event', () => {
    expect(transformTrackingEvents(makeTracking())[0].id).toBe('evt-001')
  })

  it('maps status in_transit → IN_TRANSIT', () => {
    expect(transformTrackingEvents(makeTracking())[0].status).toBe('IN_TRANSIT')
  })

  it('maps status delivered → DELIVERED', () => {
    const t = makeTracking({ events: [makeEvent({ status: 'delivered' })] })
    expect(transformTrackingEvents(t)[0].status).toBe('DELIVERED')
  })

  it('maps status pre_transit → PRE_TRANSIT', () => {
    const t = makeTracking({ events: [makeEvent({ status: 'pre_transit' })] })
    expect(transformTrackingEvents(t)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps description from event', () => {
    expect(transformTrackingEvents(makeTracking())[0].description).toBe(
      'Shipment departed Frankfurt',
    )
  })

  it('maps location fields from event.location', () => {
    const location = transformTrackingEvents(makeTracking())[0].location
    expect(location?.city).toBe('Frankfurt')
    expect(location?.country).toBe('DE')
  })

  it('maps occurredAt from occurred_at', () => {
    expect(transformTrackingEvents(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('returns single fallback event when events is empty', () => {
    const t = makeTracking({ events: [] })
    const events = transformTrackingEvents(t)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT') // maps from parent.status
    expect(events[0].trackingNumber).toBe('C1TRK123456')
  })

  it('returns single fallback event when events is null', () => {
    const t = makeTracking({ events: null })
    const events = transformTrackingEvents(t)
    expect(events).toHaveLength(1)
  })

  it('omits location when all location fields are null', () => {
    const t = makeTracking({
      events: [
        makeEvent({ location: { city: null, state: null, country_code: null, postal_code: null } }),
      ],
    })
    expect(transformTrackingEvents(t)[0].location).toBeUndefined()
  })

  it('produces output that parses against TrackingEventSchema', () => {
    for (const e of transformTrackingEvents(makeTracking())) {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    }
  })
})
