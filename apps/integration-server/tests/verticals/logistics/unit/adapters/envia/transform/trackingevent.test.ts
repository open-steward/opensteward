import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type EnviaTrackingEventRaw,
} from '../../../../../../../src/verticals/logistics/adapters/envia/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRawEvent(overrides: Partial<EnviaTrackingEventRaw> = {}): EnviaTrackingEventRaw {
  return {
    status: 'in_transit',
    description: 'En camino al destino',
    message: 'En tránsito',
    datetime: '2024-03-01T00:00:00Z',
    location: {
      city: 'Guadalajara',
      state: 'JAL',
      country: 'MX',
      postalCode: '44100',
    },
    ...overrides,
  }
}

// ─── transformTrackingEvent ───────────────────────────────────────────────────

describe('transformTrackingEvent', () => {
  it('maps status: in_transit → IN_TRANSIT', () => {
    expect(transformTrackingEvent(makeRawEvent()).status).toBe('IN_TRANSIT')
  })

  it('prefers message over description for description field', () => {
    const result = transformTrackingEvent(makeRawEvent())
    // raw.message ?? raw.description → description — verified in source
    expect(result.description).toBe('En tránsito')
  })

  it('falls back to description when message is absent', () => {
    const result = transformTrackingEvent(makeRawEvent({ message: null }))
    expect(result.description).toBe('En camino al destino')
  })

  it('maps location city from nested location object', () => {
    const result = transformTrackingEvent(makeRawEvent())
    expect(result.location?.city).toBe('Guadalajara')
    expect(result.location?.state).toBe('JAL')
  })

  it('maps occurredAt from datetime to Date', () => {
    expect(transformTrackingEvent(makeRawEvent()).occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to date when datetime is absent', () => {
    const result = transformTrackingEvent(
      makeRawEvent({ datetime: null, date: '2024-03-01T00:00:00Z' }),
    )
    expect(result.occurredAt).toBeInstanceOf(Date)
  })

  it('threads shipmentId, trackingNumber, carrierId through', () => {
    const result = transformTrackingEvent(makeRawEvent(), 'shp-001', 'TRK123', 'fedex')
    expect(result.shipmentId).toBe('shp-001')
    expect(result.trackingNumber).toBe('TRK123')
    expect(result.carrierId).toBe('fedex')
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['label_created', 'PRE_TRANSIT'],
      ['en_camino', 'IN_TRANSIT'],
      ['en_reparto', 'OUT_FOR_DELIVERY'],
      ['entregado', 'DELIVERED'],
      ['pickup_ready', 'AVAILABLE_FOR_PICKUP'],
      ['devuelto', 'RETURN_TO_SENDER'],
      ['exception_error', 'FAILURE'],
      ['something_unknown', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformTrackingEvent(makeRawEvent({ status })).status).toBe(expected)
    }
  })

  it('sets location to undefined when location has no fields', () => {
    const result = transformTrackingEvent(
      makeRawEvent({ location: { city: null, state: null, country: null, postalCode: null } }),
    )
    expect(result.location).toBeUndefined()
  })

  it('passes through metadata (raw event) unmodified', () => {
    const raw = makeRawEvent()
    expect(transformTrackingEvent(raw).metadata).toBe(raw)
  })

  it('parses as TrackingEventSchema without throwing', () => {
    const result = transformTrackingEvent(makeRawEvent(), 'shp-001', 'TRK123', 'envia')
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })
})
