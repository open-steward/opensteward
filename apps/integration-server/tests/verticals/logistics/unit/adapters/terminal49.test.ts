import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type Terminal49TrackingResponse,
  type Terminal49TrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/terminal49/transform/tracking'
import {
  transformShipment,
  type Terminal49Container,
} from '../../../../../src/verticals/logistics/adapters/terminal49/transform/shipment'

function makeEvent(overrides: Partial<Terminal49TrackingEvent> = {}): Terminal49TrackingEvent {
  return {
    event: 'Loaded on vessel',
    description: 'Loaded',
    timestamp: '2024-03-15T10:30:00Z',
    location: { name: 'Long Beach', city: 'Long Beach', country: 'US', un_locode: 'USLGB' },
    ...overrides,
  }
}

function makeResponse(overrides: { container_number?: string; events?: Terminal49TrackingEvent[] } = {}): Terminal49TrackingResponse {
  return {
    container_number: overrides.container_number ?? 'TEMU1234567',
    bill_of_lading_number: 'BOL049',
    events: overrides.events ?? [
      makeEvent({ event: 'Gate-out empty' }),
      makeEvent({ event: 'Loaded on vessel' }),
      makeEvent({ event: 'Vessel arrival' }),
      makeEvent({ event: 'Discharged from vessel' }),
      makeEvent({ event: 'Delivered' }),
    ],
  }
}

function makeContainer(overrides: Partial<Terminal49Container> = {}): Terminal49Container {
  return {
    container_number: 'TEMU1234567',
    bill_of_lading_number: 'BOL049',
    status: 'In Transit',
    weight: 22500,
    weight_unit: 'kg',
    port_of_lading: { city: 'Shanghai', country: 'CN' },
    port_of_discharge: { city: 'Long Beach', country: 'US' },
    pod_eta_at: '2024-04-25T12:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('Terminal49 transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeResponse())).toHaveLength(5)
  })
  it('maps fields to canonical event', () => {
    const e = transformTracking(makeResponse())[1]
    expect(e.trackingNumber).toBe('TEMU1234567')
    expect(e.carrierId).toBe('terminal49')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('Long Beach')
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
  it('maps ocean event types correctly', () => {
    const cases: [string, string][] = [
      ['Gate-out empty', 'PRE_TRANSIT'],
      ['Loaded on vessel', 'IN_TRANSIT'],
      ['Vessel arrival', 'IN_TRANSIT'],
      ['Discharged from vessel', 'IN_TRANSIT'],
      ['Gate-in at destination', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Exception', 'FAILURE'],
      ['Random', 'UNKNOWN'],
    ]
    for (const [event, expected] of cases) {
      const e = transformTracking(makeResponse({ events: [makeEvent({ event })] }))[0]
      expect(e.status).toBe(expected)
    }
  })
  it('handles multi-event scenarios', () => {
    const events = transformTracking(makeResponse())
    expect(events[0].status).toBe('PRE_TRANSIT')
    expect(events[events.length - 1].status).toBe('DELIVERED')
  })
})

describe('Terminal49 transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeContainer())
    expect(r.id).toBe('TEMU1234567')
    expect(r.trackingNumber).toBe('TEMU1234567')
    expect(r.carrierId).toBe('terminal49')
    expect(r.reference).toBe('BOL049')
    expect(r.status).toBe('IN_TRANSIT')
  })
  it('maps weight', () => {
    const r = transformShipment(makeContainer())
    expect(r.totalWeight?.value).toBe(22500)
    expect(r.totalWeight?.unit).toBe('kg')
  })
  it('passes through metadata unmodified', () => {
    const raw = makeContainer()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
  it('handles missing optional fields', () => {
    const r = transformShipment(makeContainer({ weight: null, status: null, port_of_lading: null, port_of_discharge: null }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.status).toBe('UNKNOWN')
  })
  it("sets mode to 'ocean' and populates ocean fields", () => {
    const r = transformShipment(makeContainer())
    expect(r.mode).toBe('ocean')
    expect(r.ocean).toBeDefined()
    expect(r.ocean?.containerNumber).toBe('TEMU1234567')
  })
})
