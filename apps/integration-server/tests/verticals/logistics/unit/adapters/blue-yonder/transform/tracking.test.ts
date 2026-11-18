import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type BlueYonderTrackingResponse,
  type BlueYonderTrackingEvent,
  type BlueYonderTrackingLocation,
} from '../../../../../../../src/verticals/logistics/adapters/blue-yonder/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeLocation(
  overrides: Partial<BlueYonderTrackingLocation> = {},
): BlueYonderTrackingLocation {
  return {
    streetAddress: '100 Commerce Blvd',
    city: 'Atlanta',
    stateOrProvince: 'GA',
    postalCode: '30301',
    countryCode: 'US',
    ...overrides,
  }
}

function makeEvent(overrides: Partial<BlueYonderTrackingEvent> = {}): BlueYonderTrackingEvent {
  return {
    eventDateTime: '2024-03-01T00:00:00Z',
    statusCode: 'IN_TRANSIT',
    statusDescription: 'Shipment is in transit',
    location: makeLocation(),
    ...overrides,
  }
}

function makeResponse(
  overrides: Partial<BlueYonderTrackingResponse> = {},
): BlueYonderTrackingResponse {
  return {
    trackingNumber: 'BY-TRK-001',
    shipmentId: 'shp-001',
    currentStatus: 'IN_TRANSIT',
    currentStatusDescription: 'Shipment in transit',
    events: [makeEvent()],
    ...overrides,
  }
}

// ─── transformTrackingEvents — events array path ──────────────────────────────

describe('transformTrackingEvents — events array path', () => {
  it('produces one event per element in events', () => {
    const raw = makeResponse({ events: [makeEvent(), makeEvent({ statusCode: 'DELIVERED' })] })
    expect(transformTrackingEvents(raw)).toHaveLength(2)
  })

  it('maps trackingNumber from raw.trackingNumber', () => {
    expect(transformTrackingEvents(makeResponse())[0].trackingNumber).toBe('BY-TRK-001')
  })

  it('maps carrierId to "blue-yonder" on every event', () => {
    const raw = makeResponse({ events: [makeEvent(), makeEvent()] })
    transformTrackingEvents(raw).forEach((e) => expect(e.carrierId).toBe('blue-yonder'))
  })

  it('maps IN_TRANSIT statusCode to IN_TRANSIT', () => {
    expect(transformTrackingEvents(makeResponse())[0].status).toBe('IN_TRANSIT')
  })

  it('maps CREATED statusCode to PRE_TRANSIT', () => {
    const raw = makeResponse({ events: [makeEvent({ statusCode: 'CREATED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps TENDERED statusCode to PRE_TRANSIT', () => {
    const raw = makeResponse({ events: [makeEvent({ statusCode: 'TENDERED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps PICKED_UP statusCode to IN_TRANSIT', () => {
    const raw = makeResponse({ events: [makeEvent({ statusCode: 'PICKED_UP' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('IN_TRANSIT')
  })

  it('maps OUT_FOR_DELIVERY statusCode to OUT_FOR_DELIVERY', () => {
    const raw = makeResponse({ events: [makeEvent({ statusCode: 'OUT_FOR_DELIVERY' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps DELIVERED statusCode to DELIVERED', () => {
    const raw = makeResponse({ events: [makeEvent({ statusCode: 'DELIVERED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps AVAILABLE_FOR_PICKUP statusCode to AVAILABLE_FOR_PICKUP', () => {
    const raw = makeResponse({ events: [makeEvent({ statusCode: 'AVAILABLE_FOR_PICKUP' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps RETURN_TO_SENDER statusCode to RETURN_TO_SENDER', () => {
    const raw = makeResponse({ events: [makeEvent({ statusCode: 'RETURN_TO_SENDER' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps EXCEPTION statusCode to FAILURE', () => {
    const raw = makeResponse({ events: [makeEvent({ statusCode: 'EXCEPTION' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps CANCELLED statusCode to FAILURE', () => {
    const raw = makeResponse({ events: [makeEvent({ statusCode: 'CANCELLED' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps unknown statusCode to UNKNOWN', () => {
    const raw = makeResponse({ events: [makeEvent({ statusCode: 'WEIRD_CODE' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('UNKNOWN')
  })

  it('is case-insensitive for statusCode (lowercased input maps correctly)', () => {
    // The transform does statusCode.toUpperCase() before lookup
    const raw = makeResponse({ events: [makeEvent({ statusCode: 'delivered' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps description from statusDescription', () => {
    expect(transformTrackingEvents(makeResponse())[0].description).toBe('Shipment is in transit')
  })

  it('maps location fields correctly', () => {
    const loc = transformTrackingEvents(makeResponse())[0].location
    expect(loc?.street1).toBe('100 Commerce Blvd')
    expect(loc?.city).toBe('Atlanta')
    expect(loc?.state).toBe('GA')
    expect(loc?.postalCode).toBe('30301')
    expect(loc?.country).toBe('US')
  })

  it('returns undefined location when event has no location', () => {
    const raw = makeResponse({ events: [makeEvent({ location: undefined })] })
    expect(transformTrackingEvents(raw)[0].location).toBeUndefined()
  })

  it('returns undefined location when all location fields are absent', () => {
    const raw = makeResponse({
      events: [
        makeEvent({
          location: {
            streetAddress: undefined,
            city: undefined,
            stateOrProvince: undefined,
            postalCode: undefined,
            countryCode: undefined,
          },
        }),
      ],
    })
    expect(transformTrackingEvents(raw)[0].location).toBeUndefined()
  })

  it('parses occurredAt as a Date', () => {
    expect(transformTrackingEvents(makeResponse())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('passes metadata as the tracking event object', () => {
    const evt = makeEvent()
    const raw = makeResponse({ events: [evt] })
    expect(transformTrackingEvents(raw)[0].metadata).toBe(evt)
  })

  it('each event passes TrackingEventSchema validation', () => {
    transformTrackingEvents(makeResponse()).forEach((e) => {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    })
  })
})

// ─── transformTrackingEvents — currentStatus fallback ────────────────────────

describe('transformTrackingEvents — currentStatus fallback', () => {
  it('emits a single fallback event when events is empty', () => {
    const raw = makeResponse({ events: [] })
    expect(transformTrackingEvents(raw)).toHaveLength(1)
  })

  it('fallback uses currentStatus for status', () => {
    const raw = makeResponse({ events: [], currentStatus: 'DELIVERED' })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('fallback uses currentStatusDescription as description', () => {
    const raw = makeResponse({ events: [], currentStatusDescription: 'Package delivered' })
    expect(transformTrackingEvents(raw)[0].description).toBe('Package delivered')
  })

  it('fallback carrierId is "blue-yonder"', () => {
    const raw = makeResponse({ events: [] })
    expect(transformTrackingEvents(raw)[0].carrierId).toBe('blue-yonder')
  })

  it('fallback passes TrackingEventSchema validation', () => {
    const raw = makeResponse({ events: [] })
    expect(() => TrackingEventSchema.parse(transformTrackingEvents(raw)[0])).not.toThrow()
  })
})
