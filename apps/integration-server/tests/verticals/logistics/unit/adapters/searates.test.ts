import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type SearatesTrackingResponse,
  type SearatesTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/searates/transform/tracking'
import {
  transformShipment,
  type SearatesContainer,
} from '../../../../../src/verticals/logistics/adapters/searates/transform/shipment'

function makeEvent(overrides: Partial<SearatesTrackingEvent> = {}): SearatesTrackingEvent {
  return {
    status: 'Loaded on vessel',
    description: 'Loaded',
    date: '2024-03-15T10:30:00Z',
    location: { name: 'Antwerp', city: 'Antwerp', country: 'BE', locode: 'BEANR' },
    ...overrides,
  }
}

function makeResponse(overrides: { container?: string; events?: SearatesTrackingEvent[] } = {}): SearatesTrackingResponse {
  return {
    container: overrides.container ?? 'SRTU0000001',
    bookingNumber: 'BK-SR-1',
    events: overrides.events ?? [
      makeEvent({ status: 'Gate-out empty' }),
      makeEvent({ status: 'Loaded on vessel' }),
      makeEvent({ status: 'Vessel arrival' }),
      makeEvent({ status: 'Discharged from vessel' }),
      makeEvent({ status: 'Delivered' }),
    ],
  }
}

function makeContainer(overrides: Partial<SearatesContainer> = {}): SearatesContainer {
  return {
    container: 'SRTU0000001',
    bookingNumber: 'BK-SR-1',
    status: 'In Transit',
    weight: 14000,
    weightUnit: 'kg',
    pol: { city: 'Antwerp', country: 'BE' },
    pod: { city: 'Mumbai', country: 'IN' },
    eta: '2024-04-25T12:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('Searates transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeResponse())).toHaveLength(5)
  })
  it('maps fields to canonical event', () => {
    const e = transformTracking(makeResponse())[1]
    expect(e.trackingNumber).toBe('SRTU0000001')
    expect(e.carrierId).toBe('searates')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('Antwerp')
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

describe('Searates transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeContainer())
    expect(r.id).toBe('SRTU0000001')
    expect(r.trackingNumber).toBe('SRTU0000001')
    expect(r.carrierId).toBe('searates')
    expect(r.reference).toBe('BK-SR-1')
    expect(r.status).toBe('IN_TRANSIT')
  })
  it('maps weight', () => {
    const r = transformShipment(makeContainer())
    expect(r.totalWeight?.value).toBe(14000)
    expect(r.totalWeight?.unit).toBe('kg')
  })
  it('passes through metadata unmodified', () => {
    const raw = makeContainer()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
  it('handles missing optional fields', () => {
    const r = transformShipment(makeContainer({ weight: null, status: null, pol: null, pod: null }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.status).toBe('UNKNOWN')
  })
  it("sets mode to 'ocean' and populates ocean fields", () => {
    const r = transformShipment(makeContainer())
    expect(r.mode).toBe('ocean')
    expect(r.ocean).toBeDefined()
    expect(r.ocean?.containerNumber).toBe('SRTU0000001')
  })
})
