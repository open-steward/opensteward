import { describe, it, expect } from 'vitest'
import {
  transformVisibilityEvents,
  trackingEventFromTransport,
  type TransporeonVisibilityResponse,
  type TransporeonVisibilityEvent,
} from '../../../../../../../src/verticals/logistics/adapters/transporeon/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(
  overrides: Partial<TransporeonVisibilityEvent> = {},
): TransporeonVisibilityEvent {
  return {
    transport_id: 'transport-99',
    transport_identifier: 'EXT-TRP-9900',
    event_type: 'ARRIVAL',
    status: 'active',
    timestamp: '2024-03-01T00:00:00Z',
    location: {
      city: 'Frankfurt',
      country: 'DE',
      postal_code: '60308',
    },
    description: 'Truck arrived at hub',
    ...overrides,
  }
}

function makeResponse(
  overrides: Partial<TransporeonVisibilityResponse> = {},
): TransporeonVisibilityResponse {
  return {
    events: [
      makeEvent(),
      makeEvent({ event_type: 'DEPARTURE', description: 'Truck departed hub' }),
    ],
    ...overrides,
  }
}

describe('transporeon transformVisibilityEvents', () => {
  it('returns one event per raw visibility event', () => {
    expect(transformVisibilityEvents('TRK-1', makeResponse())).toHaveLength(2)
  })

  it('attaches the given trackingNumber to each event', () => {
    transformVisibilityEvents('TRK-99', makeResponse()).forEach((ev) => {
      expect(ev.trackingNumber).toBe('TRK-99')
    })
  })

  it('sets carrierId to "transporeon" on all events', () => {
    transformVisibilityEvents('TRK-1', makeResponse()).forEach((ev) => {
      expect(ev.carrierId).toBe('transporeon')
    })
  })

  it('maps "ARRIVAL" event_type to IN_TRANSIT', () => {
    const [ev] = transformVisibilityEvents('TRK-1', makeResponse())
    expect(ev.status).toBe('IN_TRANSIT')
  })

  it('maps "UNLOADING_COMPLETED" event_type to DELIVERED', () => {
    const [ev] = transformVisibilityEvents(
      'TRK-1',
      makeResponse({
        events: [makeEvent({ event_type: 'UNLOADING_COMPLETED' })],
      }),
    )
    expect(ev.status).toBe('DELIVERED')
  })

  it('maps "UNLOADING_STARTED" event_type to OUT_FOR_DELIVERY', () => {
    const [ev] = transformVisibilityEvents(
      'TRK-1',
      makeResponse({
        events: [makeEvent({ event_type: 'UNLOADING_STARTED' })],
      }),
    )
    expect(ev.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps unknown event_type to UNKNOWN', () => {
    const [ev] = transformVisibilityEvents(
      'TRK-1',
      makeResponse({
        events: [makeEvent({ event_type: 'SOMETHING_RANDOM', status: undefined })],
      }),
    )
    expect(ev.status).toBe('UNKNOWN')
  })

  it('maps description from event description field', () => {
    const [ev] = transformVisibilityEvents('TRK-1', makeResponse())
    expect(ev.description).toBe('Truck arrived at hub')
  })

  it('builds location from loc city/country/postal_code', () => {
    const [ev] = transformVisibilityEvents('TRK-1', makeResponse())
    expect(ev.location?.city).toBe('Frankfurt')
    expect(ev.location?.country).toBe('DE')
    expect(ev.location?.postalCode).toBe('60308')
  })

  it('sets occurredAt as a Date from timestamp', () => {
    const [ev] = transformVisibilityEvents('TRK-1', makeResponse())
    expect(ev.occurredAt).toBeInstanceOf(Date)
  })

  it('falls through to "data" key if "events" is absent', () => {
    const response: TransporeonVisibilityResponse = {
      data: [makeEvent()],
    }
    expect(transformVisibilityEvents('TRK-1', response)).toHaveLength(1)
  })

  it('returns a single synthetic UNKNOWN event when events list is empty', () => {
    const events = transformVisibilityEvents('TRK-X', { events: [] })
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('TRK-X')
  })

  it('omits location when loc has no city/country/postal_code', () => {
    const [ev] = transformVisibilityEvents(
      'TRK-1',
      makeResponse({
        events: [makeEvent({ location: { latitude: 50.1, longitude: 8.7 } })],
      }),
    )
    expect(ev.location).toBeUndefined()
  })

  it('each event passes TrackingEventSchema.parse', () => {
    transformVisibilityEvents('TRK-1', makeResponse()).forEach((ev) => {
      expect(() => TrackingEventSchema.parse(ev)).not.toThrow()
    })
  })
})

describe('transporeon trackingEventFromTransport', () => {
  it('maps "tour.routed" qualifier to PRE_TRANSIT', () => {
    const ev = trackingEventFromTransport(
      'TRK-1',
      'tour.routed',
      '2024-03-01T00:00:00Z',
      'Routed',
      {},
    )
    expect(ev.status).toBe('PRE_TRANSIT')
  })

  it('maps "tour.accepted" qualifier to IN_TRANSIT', () => {
    const ev = trackingEventFromTransport(
      'TRK-1',
      'tour.accepted',
      '2024-03-01T00:00:00Z',
      'Accepted',
      {},
    )
    expect(ev.status).toBe('IN_TRANSIT')
  })

  it('maps "tour.assigned.cancelled" qualifier to FAILURE', () => {
    const ev = trackingEventFromTransport(
      'TRK-1',
      'tour.assigned.cancelled',
      undefined,
      undefined,
      {},
    )
    expect(ev.status).toBe('FAILURE')
  })

  it('maps unknown qualifier to UNKNOWN', () => {
    const ev = trackingEventFromTransport('TRK-1', 'random', undefined, undefined, {})
    expect(ev.status).toBe('UNKNOWN')
  })

  it('maps undefined qualifier to UNKNOWN', () => {
    const ev = trackingEventFromTransport('TRK-1', undefined, undefined, undefined, {})
    expect(ev.status).toBe('UNKNOWN')
  })

  it('attaches trackingNumber and carrierId', () => {
    const ev = trackingEventFromTransport('TRK-42', 'tour.routed', undefined, undefined, {})
    expect(ev.trackingNumber).toBe('TRK-42')
    expect(ev.carrierId).toBe('transporeon')
  })

  it('uses description param as event description', () => {
    const ev = trackingEventFromTransport('TRK-1', 'tour.routed', undefined, 'Tour was routed', {})
    expect(ev.description).toBe('Tour was routed')
  })

  it('falls back to qualifier as description when description is undefined', () => {
    const ev = trackingEventFromTransport('TRK-1', 'tour.routed', undefined, undefined, {})
    expect(ev.description).toBe('tour.routed')
  })

  it('sets occurredAt as a Date when timestamp is provided', () => {
    const ev = trackingEventFromTransport(
      'TRK-1',
      'tour.routed',
      '2024-03-01T00:00:00Z',
      undefined,
      {},
    )
    expect(ev.occurredAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    const ev = trackingEventFromTransport(
      'TRK-1',
      'tour.accepted',
      '2024-03-01T00:00:00Z',
      'Accepted',
      {},
    )
    expect(() => TrackingEventSchema.parse(ev)).not.toThrow()
  })
})
