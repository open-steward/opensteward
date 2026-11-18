import { describe, it, expect } from 'vitest'
import {
  transformTrackingResponse,
  type EnviaTrackingResponse,
  type EnviaTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/envia/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<EnviaTrackingEvent> = {}): EnviaTrackingEvent {
  return {
    status: 'in_transit',
    description: 'Paquete en camino',
    datetime: '2024-03-01T00:00:00Z',
    location: {
      city: 'Monterrey',
      state: 'NL',
      country: 'MX',
      postalCode: '64000',
    },
    ...overrides,
  }
}

function makeTracking(overrides: Partial<EnviaTrackingResponse> = {}): EnviaTrackingResponse {
  return {
    trackingNumber: 'ENV555444333',
    carrier: 'redpack',
    status: 'in_transit',
    shipmentId: 'shp-555',
    events: [makeEvent({ status: 'created' }), makeEvent()],
    ...overrides,
  }
}

// ─── transformTrackingResponse ────────────────────────────────────────────────

describe('transformTrackingResponse', () => {
  it('produces one event per element in events array', () => {
    expect(transformTrackingResponse(makeTracking())).toHaveLength(2)
  })

  it('maps trackingNumber and carrierId on each event', () => {
    const event = transformTrackingResponse(makeTracking())[0]
    // raw.trackingNumber → trackingNumber, raw.carrier → carrierId — verified in source
    expect(event.trackingNumber).toBe('ENV555444333')
    expect(event.carrierId).toBe('redpack')
  })

  it('maps shipmentId from raw envelope', () => {
    const event = transformTrackingResponse(makeTracking())[0]
    expect(event.shipmentId).toBe('shp-555')
  })

  it('maps status: in_transit → IN_TRANSIT', () => {
    const event = transformTrackingResponse(makeTracking())[1]
    expect(event.status).toBe('IN_TRANSIT')
  })

  it('maps status: created → PRE_TRANSIT', () => {
    const event = transformTrackingResponse(makeTracking())[0]
    expect(event.status).toBe('PRE_TRANSIT')
  })

  it('maps location city from nested location object', () => {
    const event = transformTrackingResponse(makeTracking())[0]
    // location.city → event.location.city — verified in source
    expect(event.location?.city).toBe('Monterrey')
  })

  it('maps occurredAt to Date', () => {
    expect(transformTrackingResponse(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('returns single fallback event when events is empty', () => {
    const result = transformTrackingResponse(makeTracking({ events: [] }))
    // empty events array → push one UNKNOWN/status-derived event — verified in source
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('falls back to tracking field when events is absent', () => {
    const raw = makeTracking({ events: undefined, tracking: [makeEvent()] })
    expect(transformTrackingResponse(raw)).toHaveLength(1)
  })

  it('sets location to undefined when location is empty', () => {
    const raw = makeTracking({
      events: [
        makeEvent({ location: { city: null, state: null, country: null, postalCode: null } }),
      ],
    })
    expect(transformTrackingResponse(raw)[0].location).toBeUndefined()
  })

  it('parses each event as TrackingEventSchema without throwing', () => {
    transformTrackingResponse(makeTracking()).forEach((event) => {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    })
  })
})
