import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type WebcargoTrackingResponse,
  type WebcargoTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/webcargo/transform/tracking'
import {
  transformShipment,
  type WebcargoShipmentRaw,
} from '../../../../../src/verticals/logistics/adapters/webcargo/transform/shipment'

function makeEvent(overrides: Partial<WebcargoTrackingEvent> = {}): WebcargoTrackingEvent {
  return {
    status: 'Loaded on vessel',
    description: 'Loaded',
    timestamp: '2024-03-15T10:30:00Z',
    location: { name: 'JFK', city: 'New York', country: 'US', iata: 'JFK' },
    ...overrides,
  }
}

function makeResponse(overrides: { awbNumber?: string; events?: WebcargoTrackingEvent[] } = {}): WebcargoTrackingResponse {
  return {
    awbNumber: overrides.awbNumber ?? '125-12345678',
    bookingNumber: 'BK-WC-1',
    events: overrides.events ?? [
      makeEvent({ status: 'Booked' }),
      makeEvent({ status: 'Loaded on vessel' }),
      makeEvent({ status: 'Vessel arrival' }),
      makeEvent({ status: 'Discharged from vessel' }),
      makeEvent({ status: 'Delivered' }),
    ],
  }
}

function makeShipmentRaw(overrides: Partial<WebcargoShipmentRaw> = {}): WebcargoShipmentRaw {
  return {
    awbNumber: '125-12345678',
    bookingNumber: 'BK-WC-1',
    status: 'In Transit',
    weight: 850,
    weightUnit: 'kg',
    origin: { city: 'New York', country: 'US' },
    destination: { city: 'Frankfurt', country: 'DE' },
    estimatedArrival: '2024-04-01T12:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('Webcargo transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeResponse())).toHaveLength(5)
  })
  it('maps fields to canonical event', () => {
    const e = transformTracking(makeResponse())[1]
    expect(e.trackingNumber).toBe('125-12345678')
    expect(e.carrierId).toBe('webcargo')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('New York')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })
  it('passes through metadata unmodified', () => {
    transformTracking(makeResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })
  it('emits a single fallback event when events is empty', () => {
    const events = transformTracking(makeResponse({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })
  it('handles null location gracefully', () => {
    const e = transformTracking(makeResponse({ events: [makeEvent({ location: null })] }))[0]
    expect(e.location).toBeUndefined()
  })
  it('maps event types correctly', () => {
    const cases: [string, string][] = [
      ['Booked', 'PRE_TRANSIT'],
      ['Loaded on vessel', 'IN_TRANSIT'],
      ['Vessel arrival', 'IN_TRANSIT'],
      ['Discharged from vessel', 'IN_TRANSIT'],
      ['Gate-in at destination', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Exception', 'FAILURE'],
      ['Random', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const e = transformTracking(makeResponse({ events: [makeEvent({ status })] }))[0]
      expect(e.status).toBe(expected)
    }
  })
  it('handles multi-event scenarios', () => {
    const events = transformTracking(makeResponse())
    expect(events[0].status).toBe('PRE_TRANSIT')
    expect(events[events.length - 1].status).toBe('DELIVERED')
  })
})

describe('Webcargo transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeShipmentRaw())
    expect(r.id).toBe('125-12345678')
    expect(r.trackingNumber).toBe('125-12345678')
    expect(r.carrierId).toBe('webcargo')
    expect(r.reference).toBe('BK-WC-1')
    expect(r.status).toBe('IN_TRANSIT')
  })
  it('maps weight', () => {
    const r = transformShipment(makeShipmentRaw())
    expect(r.totalWeight?.value).toBe(850)
    expect(r.totalWeight?.unit).toBe('kg')
  })
  it('passes through metadata unmodified', () => {
    const raw = makeShipmentRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
  it('handles missing optional fields', () => {
    const r = transformShipment(makeShipmentRaw({ weight: null, status: null, origin: null, destination: null }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.status).toBe('UNKNOWN')
  })
  it("sets mode to 'ocean' and populates ocean fields", () => {
    const r = transformShipment(makeShipmentRaw())
    expect(r.mode).toBe('ocean')
    expect(r.ocean).toBeDefined()
    expect(r.ocean?.containerNumber).toBe('125-12345678')
  })
})
