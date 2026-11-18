import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type VizionTrackingResponse,
  type VizionTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/vizion/transform/tracking'
import {
  transformShipment,
  type VizionContainer,
} from '../../../../../src/verticals/logistics/adapters/vizion/transform/shipment'

function makeEvent(overrides: Partial<VizionTrackingEvent> = {}): VizionTrackingEvent {
  return {
    event_type: 'Loaded on vessel',
    description: 'Loaded',
    timestamp: '2024-03-15T10:30:00Z',
    location: { name: 'Oakland', city: 'Oakland', country: 'US', un_locode: 'USOAK' },
    ...overrides,
  }
}

function makeResponse(overrides: { container_number?: string; events?: VizionTrackingEvent[] } = {}): VizionTrackingResponse {
  return {
    container_number: overrides.container_number ?? 'CNTR0000001',
    bill_of_lading: 'BOL001',
    events: overrides.events ?? [
      makeEvent({ event_type: 'Gate-out empty' }),
      makeEvent({ event_type: 'Loaded on vessel' }),
      makeEvent({ event_type: 'Vessel arrival' }),
      makeEvent({ event_type: 'Discharged from vessel' }),
      makeEvent({ event_type: 'Delivered' }),
    ],
  }
}

function makeContainer(overrides: Partial<VizionContainer> = {}): VizionContainer {
  return {
    container_number: 'CNTR0000001',
    bill_of_lading: 'BOL001',
    status: 'In Transit',
    weight: 20500,
    weight_unit: 'kg',
    port_of_loading: { city: 'Oakland', country: 'US' },
    port_of_discharge: { city: 'Tokyo', country: 'JP' },
    estimated_arrival_at: '2024-04-20T12:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('Vizion transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeResponse())).toHaveLength(5)
  })
  it('maps fields to canonical event', () => {
    const e = transformTracking(makeResponse())[1]
    expect(e.trackingNumber).toBe('CNTR0000001')
    expect(e.carrierId).toBe('vizion')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('Oakland')
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
    for (const [event_type, expected] of cases) {
      const e = transformTracking(makeResponse({ events: [makeEvent({ event_type })] }))[0]
      expect(e.status).toBe(expected)
    }
  })
  it('handles multi-event scenarios', () => {
    const events = transformTracking(makeResponse())
    expect(events[0].status).toBe('PRE_TRANSIT')
    expect(events[events.length - 1].status).toBe('DELIVERED')
  })
})

describe('Vizion transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeContainer())
    expect(r.id).toBe('CNTR0000001')
    expect(r.trackingNumber).toBe('CNTR0000001')
    expect(r.carrierId).toBe('vizion')
    expect(r.reference).toBe('BOL001')
    expect(r.status).toBe('IN_TRANSIT')
  })
  it('maps weight', () => {
    const r = transformShipment(makeContainer())
    expect(r.totalWeight?.value).toBe(20500)
    expect(r.totalWeight?.unit).toBe('kg')
  })
  it('passes through metadata unmodified', () => {
    const raw = makeContainer()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
  it('handles missing optional fields', () => {
    const r = transformShipment(makeContainer({ weight: null, status: null, port_of_loading: null, port_of_discharge: null }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.status).toBe('UNKNOWN')
  })
  it("sets mode to 'ocean' and populates ocean fields", () => {
    const r = transformShipment(makeContainer())
    expect(r.mode).toBe('ocean')
    expect(r.ocean).toBeDefined()
    expect(r.ocean?.containerNumber).toBe('CNTR0000001')
  })
})
