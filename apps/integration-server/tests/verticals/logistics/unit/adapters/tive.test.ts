import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type TiveTrackingResponse,
  type TiveTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/tive/transform/tracking'
import {
  transformShipment,
  type TiveContainer,
} from '../../../../../src/verticals/logistics/adapters/tive/transform/shipment'

function makeEvent(overrides: Partial<TiveTrackingEvent> = {}): TiveTrackingEvent {
  return {
    type: 'Loaded on vessel',
    description: 'Loaded',
    occurredAt: '2024-03-15T10:30:00Z',
    location: { name: 'Boston', city: 'Boston', country: 'US', code: 'USBOS' },
    ...overrides,
  }
}

function makeResponse(overrides: { trackerId?: string; events?: TiveTrackingEvent[] } = {}): TiveTrackingResponse {
  return {
    trackerId: overrides.trackerId ?? 'TIVE001',
    shipmentId: 'SHP-001',
    events: overrides.events ?? [
      makeEvent({ type: 'Gate-out empty' }),
      makeEvent({ type: 'Loaded on vessel' }),
      makeEvent({ type: 'Vessel arrival' }),
      makeEvent({ type: 'Discharged from vessel' }),
      makeEvent({ type: 'Delivered' }),
    ],
  }
}

function makeContainer(overrides: Partial<TiveContainer> = {}): TiveContainer {
  return {
    trackerId: 'TIVE001',
    shipmentId: 'SHP-001',
    status: 'In Transit',
    weight: 16000,
    weightUnit: 'kg',
    origin: { city: 'Boston', country: 'US' },
    destination: { city: 'London', country: 'GB' },
    estimatedArrival: '2024-04-15T12:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('Tive transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeResponse())).toHaveLength(5)
  })
  it('maps fields to canonical event', () => {
    const e = transformTracking(makeResponse())[1]
    expect(e.trackingNumber).toBe('TIVE001')
    expect(e.carrierId).toBe('tive')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('Boston')
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
      ['Alert', 'FAILURE'],
      ['Random', 'UNKNOWN'],
    ]
    for (const [type, expected] of cases) {
      const e = transformTracking(makeResponse({ events: [makeEvent({ type })] }))[0]
      expect(e.status).toBe(expected)
    }
  })
  it('handles multi-event scenarios', () => {
    const events = transformTracking(makeResponse())
    expect(events[0].status).toBe('PRE_TRANSIT')
    expect(events[events.length - 1].status).toBe('DELIVERED')
  })
})

describe('Tive transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeContainer())
    expect(r.id).toBe('TIVE001')
    expect(r.trackingNumber).toBe('TIVE001')
    expect(r.carrierId).toBe('tive')
    expect(r.reference).toBe('SHP-001')
    expect(r.status).toBe('IN_TRANSIT')
  })
  it('maps weight', () => {
    const r = transformShipment(makeContainer())
    expect(r.totalWeight?.value).toBe(16000)
    expect(r.totalWeight?.unit).toBe('kg')
  })
  it('passes through metadata unmodified', () => {
    const raw = makeContainer()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
  it('handles missing optional fields', () => {
    const r = transformShipment(makeContainer({ weight: null, status: null, origin: null, destination: null }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.status).toBe('UNKNOWN')
  })
  it("sets mode to 'ocean' and populates ocean fields", () => {
    const r = transformShipment(makeContainer())
    expect(r.mode).toBe('ocean')
    expect(r.ocean).toBeDefined()
    expect(r.ocean?.containerNumber).toBe('TIVE001')
  })
})
