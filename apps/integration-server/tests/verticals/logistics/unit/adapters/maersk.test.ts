import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type MaerskTrackingResponse,
  type MaerskTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/maersk/transform/tracking'
import {
  transformShipment,
  type MaerskContainer,
} from '../../../../../src/verticals/logistics/adapters/maersk/transform/shipment'

function makeEvent(overrides: Partial<MaerskTrackingEvent> = {}): MaerskTrackingEvent {
  return {
    eventType: 'Loaded on vessel',
    description: 'Loaded on vessel MAERSK SEALAND',
    eventDateTime: '2024-03-15T10:30:00Z',
    eventLocation: { locationName: 'Port of Rotterdam', city: 'Rotterdam', country: 'NL', UNLocationCode: 'NLRTM' },
    ...overrides,
  }
}

function makeResponse(overrides: { containerNumber?: string; events?: MaerskTrackingEvent[] } = {}): MaerskTrackingResponse {
  return {
    containerNumber: overrides.containerNumber ?? 'MSKU1234567',
    bookingNumber: 'BK00001',
    events: overrides.events ?? [
      makeEvent({ eventType: 'Gate-out empty' }),
      makeEvent({ eventType: 'Loaded on vessel' }),
      makeEvent({ eventType: 'Vessel arrival' }),
      makeEvent({ eventType: 'Discharged from vessel' }),
      makeEvent({ eventType: 'Delivered' }),
    ],
  }
}

function makeContainer(overrides: Partial<MaerskContainer> = {}): MaerskContainer {
  return {
    containerNumber: 'MSKU1234567',
    bookingNumber: 'BK00001',
    status: 'In Transit',
    vesselName: 'MAERSK SEALAND',
    voyageNumber: '123E',
    weight: 22000,
    weightUnit: 'kg',
    portOfLoading: { city: 'Rotterdam', country: 'NL' },
    portOfDischarge: { city: 'New York', country: 'US' },
    estimatedTimeOfArrival: '2024-04-01T12:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('Maersk transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeResponse())).toHaveLength(5)
  })

  it('maps fields to canonical event', () => {
    const e = transformTracking(makeResponse())[1]
    expect(e.trackingNumber).toBe('MSKU1234567')
    expect(e.carrierId).toBe('maersk')
    expect(e.status).toBe('IN_TRANSIT')
    expect(e.location?.city).toBe('Rotterdam')
    expect(e.location?.country).toBe('NL')
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
    const e = transformTracking(makeResponse({ events: [makeEvent({ eventLocation: null })] }))[0]
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
    for (const [eventType, expected] of cases) {
      const e = transformTracking(makeResponse({ events: [makeEvent({ eventType })] }))[0]
      expect(e.status).toBe(expected)
    }
  })

  it('handles multi-event scenarios', () => {
    const events = transformTracking(makeResponse())
    expect(events[0].status).toBe('PRE_TRANSIT')
    expect(events[events.length - 1].status).toBe('DELIVERED')
  })

  it('falls back through alternate eventType fields', () => {
    const e = transformTracking(makeResponse({
      events: [makeEvent({ eventType: null, shipmentEventTypeCode: 'Delivered' })],
    }))[0]
    expect(e.status).toBe('DELIVERED')
  })
})

describe('Maersk transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeContainer())
    expect(r.id).toBe('MSKU1234567')
    expect(r.trackingNumber).toBe('MSKU1234567')
    expect(r.carrierId).toBe('maersk')
    expect(r.reference).toBe('BK00001')
    expect(r.status).toBe('IN_TRANSIT')
  })

  it('maps weight', () => {
    const r = transformShipment(makeContainer())
    expect(r.totalWeight?.value).toBe(22000)
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
    expect(r.ocean?.containerNumber).toBe('MSKU1234567')
    expect(r.ocean?.vesselName).toBe('MAERSK SEALAND')
  })
})
