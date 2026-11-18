import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type Kobo360TrackingResponse,
  type Kobo360TrackingEventRaw,
} from '../../../../../../../src/verticals/logistics/adapters/kobo360/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(o: Partial<Kobo360TrackingEventRaw> = {}): Kobo360TrackingEventRaw {
  return {
    id: 'evt-1',
    status: 'IN_TRANSIT',
    description: 'Cargo en route',
    timestamp: '2024-03-01T00:00:00Z',
    location: {
      address: '10 Origin Road',
      city: 'Lagos',
      state: 'Lagos State',
      country: 'NG',
    },
    ...o,
  }
}

function makeTracking(o: Partial<Kobo360TrackingResponse> = {}): Kobo360TrackingResponse {
  return {
    trip_id: 'trip-1',
    tracking_number: 'KBO-TRK-001',
    status: 'IN_TRANSIT',
    status_description: 'Cargo is in transit',
    events: [makeEvent()],
    ...o,
  }
}

describe('kobo360 transformTrackingEvents — with events', () => {
  it('maps one event per raw event', () => {
    expect(transformTrackingEvents(makeTracking())).toHaveLength(1)
  })

  it('maps tracking_number to trackingNumber', () => {
    expect(transformTrackingEvents(makeTracking())[0].trackingNumber).toBe('KBO-TRK-001')
  })

  it('falls back to trip_id when tracking_number absent', () => {
    const result = transformTrackingEvents(makeTracking({ tracking_number: undefined }))
    expect(result[0].trackingNumber).toBe('trip-1')
  })

  it('always sets carrierId to kobo360', () => {
    expect(transformTrackingEvents(makeTracking())[0].carrierId).toBe('kobo360')
  })

  it('maps IN_TRANSIT event status', () => {
    expect(transformTrackingEvents(makeTracking())[0].status).toBe('IN_TRANSIT')
  })

  it('maps PENDING event status to PRE_TRANSIT', () => {
    const result = transformTrackingEvents(
      makeTracking({ events: [makeEvent({ status: 'PENDING' })] }),
    )
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('maps DELIVERED event status', () => {
    const result = transformTrackingEvents(
      makeTracking({ events: [makeEvent({ status: 'DELIVERED' })] }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps CANCELLED event status to FAILURE', () => {
    const result = transformTrackingEvents(
      makeTracking({ events: [makeEvent({ status: 'CANCELLED' })] }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps description', () => {
    expect(transformTrackingEvents(makeTracking())[0].description).toBe('Cargo en route')
  })

  it('falls back to message when description absent', () => {
    const result = transformTrackingEvents(
      makeTracking({ events: [makeEvent({ description: undefined, message: 'On the way' })] }),
    )
    expect(result[0].description).toBe('On the way')
  })

  it('maps event location', () => {
    const result = transformTrackingEvents(makeTracking())
    expect(result[0].location?.city).toBe('Lagos')
    expect(result[0].location?.street1).toBe('10 Origin Road')
  })

  it('maps timestamp to occurredAt Date', () => {
    expect(transformTrackingEvents(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to event_time when timestamp absent', () => {
    const result = transformTrackingEvents(
      makeTracking({
        events: [makeEvent({ timestamp: undefined, event_time: '2024-03-01T00:00:00Z' })],
      }),
    )
    expect(result[0].occurredAt).toBeInstanceOf(Date)
  })

  it('attaches event metadata', () => {
    const raw = makeTracking()
    expect(transformTrackingEvents(raw)[0].metadata).toBe(raw.events![0])
  })

  it('validates against TrackingEventSchema', () => {
    const result = transformTrackingEvents(makeTracking())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })
})

describe('kobo360 transformTrackingEvents — no events (fallback)', () => {
  it('returns one synthetic event when events array is empty', () => {
    expect(transformTrackingEvents(makeTracking({ events: [] }))).toHaveLength(1)
  })

  it('uses top-level status for synthetic event', () => {
    const result = transformTrackingEvents(makeTracking({ events: [], status: 'DELIVERED' }))
    expect(result[0].status).toBe('DELIVERED')
  })

  it('uses status_description as description', () => {
    const result = transformTrackingEvents(makeTracking({ events: [] }))
    expect(result[0].description).toBe('Cargo is in transit')
  })

  it('attaches top-level response as metadata', () => {
    const raw = makeTracking({ events: [] })
    expect(transformTrackingEvents(raw)[0].metadata).toBe(raw)
  })
})
