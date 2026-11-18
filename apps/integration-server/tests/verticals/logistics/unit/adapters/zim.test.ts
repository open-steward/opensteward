import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ZimTrackingResponse,
  type ZimTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/zim/transform/tracking'
import {
  transformShipment,
  type ZimContainer,
} from '../../../../../src/verticals/logistics/adapters/zim/transform/shipment'

function makeEvent(overrides: Partial<ZimTrackingEvent> = {}): ZimTrackingEvent {
  return {
    eventName: 'Loaded on vessel',
    description: 'Loaded',
    eventDateTime: '2024-03-15T10:30:00Z',
    location: { name: 'Haifa', city: 'Haifa', country: 'IL', unLocode: 'ILHFA' },
    ...overrides,
  }
}

function makeResponse(overrides: { containerNumber?: string; events?: ZimTrackingEvent[] } = {}): ZimTrackingResponse {
  return {
    containerNumber: overrides.containerNumber ?? 'ZIMU1234567',
    bookingNumber: 'BK03',
    events: overrides.events ?? [
      makeEvent({ eventName: 'Gate-out empty' }),
      makeEvent({ eventName: 'Loaded on vessel' }),
      makeEvent({ eventName: 'Vessel arrival' }),
      makeEvent({ eventName: 'Discharged from vessel' }),
      makeEvent({ eventName: 'Delivered' }),
    ],
  }
}

function makeContainer(overrides: Partial<ZimContainer> = {}): ZimContainer {
  return {
    containerNumber: 'ZIMU1234567',
    bookingNumber: 'BK03',
    status: 'In Transit',
    weight: 17500,
    weightUnit: 'kg',
    portOfLoading: { city: 'Haifa', country: 'IL' },
    portOfDischarge: { city: 'New York', country: 'US' },
    estimatedTimeOfArrival: '2024-04-15T12:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('Zim transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeResponse())).toHaveLength(5)
  })
  it('maps fields to canonical event', () => {
    const e = transformTracking(makeResponse())[1]
    expect(e.trackingNumber).toBe('ZIMU1234567')
    expect(e.carrierId).toBe('zim')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('Haifa')
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
    for (const [eventName, expected] of cases) {
      const e = transformTracking(makeResponse({ events: [makeEvent({ eventName })] }))[0]
      expect(e.status).toBe(expected)
    }
  })
  it('handles multi-event scenarios', () => {
    const events = transformTracking(makeResponse())
    expect(events[0].status).toBe('PRE_TRANSIT')
    expect(events[events.length - 1].status).toBe('DELIVERED')
  })
})

describe('Zim transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeContainer())
    expect(r.id).toBe('ZIMU1234567')
    expect(r.trackingNumber).toBe('ZIMU1234567')
    expect(r.carrierId).toBe('zim')
    expect(r.reference).toBe('BK03')
    expect(r.status).toBe('IN_TRANSIT')
  })
  it('maps weight', () => {
    const r = transformShipment(makeContainer())
    expect(r.totalWeight?.value).toBe(17500)
    expect(r.totalWeight?.unit).toBe('kg')
  })
  it('passes through metadata unmodified', () => {
    const raw = makeContainer()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
  it('handles missing optional fields', () => {
    const r = transformShipment(makeContainer({ weight: null, status: null, portOfLoading: null, portOfDischarge: null }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.status).toBe('UNKNOWN')
  })
  it("sets mode to 'ocean' and populates ocean fields", () => {
    const r = transformShipment(makeContainer())
    expect(r.mode).toBe('ocean')
    expect(r.ocean).toBeDefined()
    expect(r.ocean?.containerNumber).toBe('ZIMU1234567')
  })
})
