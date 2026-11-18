import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type EnviaYaTracking,
  type EnviaYaTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/enviaya/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<EnviaYaTrackingEvent> = {}): EnviaYaTrackingEvent {
  return {
    event_code: 'IN_TRANSIT',
    event_description: 'Shipment in transit',
    shipment_status: 'in_transit',
    datetime: '2024-03-01T00:00:00Z',
    city: 'CDMX',
    state: 'CDMX',
    country: 'MX',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<EnviaYaTracking> = {}): EnviaYaTracking {
  return {
    carrier: 'dhl',
    shipment_number: 'TRK-EY-001',
    enviaya_shipment_number: 'EY-001',
    shipment_status: 'in_transit',
    tracking_events: [
      makeTrackingEvent({ shipment_status: 'label_created', event_description: 'Label created' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

// ─── transformTracking ────────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per element in tracking_events', () => {
    expect(transformTracking(makeTracking())).toHaveLength(2)
  })

  it('maps trackingNumber from shipment_number', () => {
    const event = transformTracking(makeTracking())[0]
    // raw.shipment_number → trackingNumber — verified in source
    expect(event.trackingNumber).toBe('TRK-EY-001')
  })

  it('maps carrierId', () => {
    expect(transformTracking(makeTracking())[0].carrierId).toBe('dhl')
  })

  it('maps status: in_transit → IN_TRANSIT', () => {
    expect(transformTracking(makeTracking())[1].status).toBe('IN_TRANSIT')
  })

  it('maps status: label_created → PRE_TRANSIT', () => {
    // PRE_TRANSIT for label_created — verified in source
    expect(transformTracking(makeTracking())[0].status).toBe('PRE_TRANSIT')
  })

  it('maps description from event_description', () => {
    expect(transformTracking(makeTracking())[1].description).toBe('Shipment in transit')
  })

  it('maps location from city/state/country on event', () => {
    const event = transformTracking(makeTracking())[1]
    // toLocation uses evt.city/state/country — verified in source
    expect(event.location?.city).toBe('CDMX')
    expect(event.location?.country).toBe('MX')
  })

  it('maps occurredAt to Date', () => {
    expect(transformTracking(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('returns single fallback event when tracking_events is empty', () => {
    const result = transformTracking(makeTracking({ tracking_events: [] }))
    // empty → single summary event — verified in source
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps statuses: delivered → DELIVERED', () => {
    const raw = makeTracking({
      tracking_events: [makeTrackingEvent({ shipment_status: 'delivered' })],
    })
    expect(transformTracking(raw)[0].status).toBe('DELIVERED')
  })

  it('maps statuses: returned → RETURN_TO_SENDER', () => {
    const raw = makeTracking({
      tracking_events: [makeTrackingEvent({ shipment_status: 'returned' })],
    })
    expect(transformTracking(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('parses each event as TrackingEventSchema without throwing', () => {
    transformTracking(makeTracking()).forEach((event) => {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    })
  })
})
