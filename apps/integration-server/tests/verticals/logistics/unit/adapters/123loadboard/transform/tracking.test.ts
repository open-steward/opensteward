import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type LoadboardLoad,
  type LoadboardStatusEvent,
  type LoadboardLocation,
} from '../../../../../../../src/verticals/logistics/adapters/123loadboard/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeLocation(overrides: Partial<LoadboardLocation> = {}): LoadboardLocation {
  return {
    city: 'Chicago',
    state: 'IL',
    postalCode: '60601',
    country: 'US',
    ...overrides,
  }
}

function makeStatusEvent(overrides: Partial<LoadboardStatusEvent> = {}): LoadboardStatusEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Load is in transit',
    timestamp: '2024-03-01T00:00:00Z',
    location: makeLocation(),
    ...overrides,
  }
}

function makeLoad(overrides: Partial<LoadboardLoad> = {}): LoadboardLoad {
  return {
    loadId: 'load-001',
    referenceNumber: 'REF-001',
    status: 'IN_TRANSIT',
    statusDescription: 'Load is moving',
    origin: makeLocation({ city: 'Dallas', state: 'TX', postalCode: '75201' }),
    destination: makeLocation({ city: 'Los Angeles', state: 'CA', postalCode: '90001' }),
    pickupDate: '2024-03-01T00:00:00Z',
    deliveryDate: '2024-03-03T00:00:00Z',
    statusHistory: [],
    ...overrides,
  }
}

// ─── transformTrackingEvents — statusHistory path ─────────────────────────────

describe('transformTrackingEvents — statusHistory path', () => {
  it('produces one event per statusHistory entry', () => {
    const raw = makeLoad({
      statusHistory: [
        makeStatusEvent(),
        makeStatusEvent({ status: 'DELIVERED', timestamp: '2024-03-03T00:00:00Z' }),
      ],
    })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(2)
  })

  it('maps trackingNumber from loadId', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent()] })
    const event = transformTrackingEvents(raw)[0]
    expect(event.trackingNumber).toBe('load-001')
  })

  it('maps carrierId to 123loadboard on every event', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent()] })
    const event = transformTrackingEvents(raw)[0]
    expect(event.carrierId).toBe('123loadboard')
  })

  it('maps IN_TRANSIT status via TRACKING_STATUS_MAP', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent({ status: 'IN_TRANSIT' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('IN_TRANSIT')
  })

  it('maps DELIVERED status', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent({ status: 'DELIVERED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps AVAILABLE to PRE_TRANSIT', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent({ status: 'AVAILABLE' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps BOOKED to PRE_TRANSIT', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent({ status: 'BOOKED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps PICKED_UP to IN_TRANSIT', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent({ status: 'PICKED_UP' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('IN_TRANSIT')
  })

  it('maps CANCELLED to FAILURE', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent({ status: 'CANCELLED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps EXPIRED to FAILURE', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent({ status: 'EXPIRED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent({ status: 'WEIRD_STATUS' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('UNKNOWN')
  })

  it('maps description from event', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent({ description: 'Customs cleared' })] })
    expect(transformTrackingEvents(raw)[0].description).toBe('Customs cleared')
  })

  it('maps location fields from event.location', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent()] })
    const loc = transformTrackingEvents(raw)[0].location
    expect(loc?.city).toBe('Chicago')
    expect(loc?.state).toBe('IL')
    expect(loc?.postalCode).toBe('60601')
    expect(loc?.country).toBe('US')
  })

  it('defaults country to US when not provided in location', () => {
    const raw = makeLoad({
      statusHistory: [
        makeStatusEvent({
          location: { city: 'Chicago', state: 'IL', postalCode: null, country: null },
        }),
      ],
    })
    expect(transformTrackingEvents(raw)[0].location?.country).toBe('US')
  })

  it('returns undefined location when all location fields are null', () => {
    const raw = makeLoad({
      statusHistory: [
        makeStatusEvent({ location: { city: null, state: null, postalCode: null, country: null } }),
      ],
    })
    expect(transformTrackingEvents(raw)[0].location).toBeUndefined()
  })

  it('returns undefined location when location is null', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent({ location: null })] })
    expect(transformTrackingEvents(raw)[0].location).toBeUndefined()
  })

  it('parses occurredAt as a Date', () => {
    const raw = makeLoad({
      statusHistory: [makeStatusEvent({ timestamp: '2024-03-01T00:00:00Z' })],
    })
    expect(transformTrackingEvents(raw)[0].occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata as the event object', () => {
    const evt = makeStatusEvent()
    const raw = makeLoad({ statusHistory: [evt] })
    expect(transformTrackingEvents(raw)[0].metadata).toBe(evt)
  })

  it('each event passes TrackingEventSchema validation', () => {
    const raw = makeLoad({ statusHistory: [makeStatusEvent()] })
    transformTrackingEvents(raw).forEach((e) => {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    })
  })
})

// ─── transformTrackingEvents — pickupDate/deliveryDate fallback ───────────────

describe('transformTrackingEvents — pickup/delivery date fallback', () => {
  it('emits PRE_TRANSIT event from pickupDate', () => {
    const raw = makeLoad({ statusHistory: [], deliveryDate: null })
    const events = transformTrackingEvents(raw)
    expect(events.some((e) => e.status === 'PRE_TRANSIT')).toBe(true)
  })

  it('PRE_TRANSIT event has description "Load picked up"', () => {
    const raw = makeLoad({ statusHistory: [], deliveryDate: null })
    const pickup = transformTrackingEvents(raw).find((e) => e.status === 'PRE_TRANSIT')
    expect(pickup?.description).toBe('Load picked up')
  })

  it('emits DELIVERED event from deliveryDate', () => {
    const raw = makeLoad({ statusHistory: [], pickupDate: null })
    const events = transformTrackingEvents(raw)
    expect(events.some((e) => e.status === 'DELIVERED')).toBe(true)
  })

  it('DELIVERED event has description "Load delivered"', () => {
    const raw = makeLoad({ statusHistory: [], pickupDate: null })
    const delivered = transformTrackingEvents(raw).find((e) => e.status === 'DELIVERED')
    expect(delivered?.description).toBe('Load delivered')
  })

  it('emits both PRE_TRANSIT and DELIVERED when both dates present', () => {
    const raw = makeLoad({ statusHistory: [] })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(2)
    expect(events[0].status).toBe('PRE_TRANSIT')
    expect(events[1].status).toBe('DELIVERED')
  })

  it('uses origin as location for pickup event', () => {
    const raw = makeLoad({ statusHistory: [], deliveryDate: null })
    const pickup = transformTrackingEvents(raw).find((e) => e.status === 'PRE_TRANSIT')
    expect(pickup?.location?.city).toBe('Dallas')
  })

  it('uses destination as location for delivery event', () => {
    const raw = makeLoad({ statusHistory: [], pickupDate: null })
    const delivered = transformTrackingEvents(raw).find((e) => e.status === 'DELIVERED')
    expect(delivered?.location?.city).toBe('Los Angeles')
  })

  it('passes metadata as raw load on pickup/delivery events', () => {
    const raw = makeLoad({ statusHistory: [], deliveryDate: null })
    expect(transformTrackingEvents(raw)[0].metadata).toBe(raw)
  })

  it('each event passes TrackingEventSchema validation', () => {
    const raw = makeLoad({ statusHistory: [] })
    transformTrackingEvents(raw).forEach((e) => {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    })
  })
})

// ─── transformTrackingEvents — bare status fallback ───────────────────────────

describe('transformTrackingEvents — bare status fallback', () => {
  it('emits a single fallback event when no history, no dates', () => {
    const raw = makeLoad({ statusHistory: [], pickupDate: null, deliveryDate: null })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
  })

  it('fallback event uses raw.status', () => {
    const raw = makeLoad({
      statusHistory: [],
      pickupDate: null,
      deliveryDate: null,
      status: 'DELIVERED',
    })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('fallback event uses raw.statusDescription', () => {
    const raw = makeLoad({
      statusHistory: [],
      pickupDate: null,
      deliveryDate: null,
      statusDescription: 'Something happened',
    })
    expect(transformTrackingEvents(raw)[0].description).toBe('Something happened')
  })

  it('falls back to UNKNOWN when raw.status is null', () => {
    const raw = makeLoad({ statusHistory: [], pickupDate: null, deliveryDate: null, status: null })
    expect(transformTrackingEvents(raw)[0].status).toBe('UNKNOWN')
  })

  it('uses referenceNumber as trackingNumber when loadId is null', () => {
    const raw = makeLoad({
      loadId: null,
      statusHistory: [],
      pickupDate: null,
      deliveryDate: null,
    })
    expect(transformTrackingEvents(raw)[0].trackingNumber).toBe('REF-001')
  })

  it('fallback event passes TrackingEventSchema validation', () => {
    const raw = makeLoad({ statusHistory: [], pickupDate: null, deliveryDate: null })
    expect(() => TrackingEventSchema.parse(transformTrackingEvents(raw)[0])).not.toThrow()
  })
})
