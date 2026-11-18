import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type DhlParcelDeTrackingResponse,
  type DhlParcelDeTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/dhl-parcel-de/transform/tracking'
import {
  transformShipment,
  type DhlParcelDeShipment,
} from '../../../../../src/verticals/logistics/adapters/dhl-parcel-de/transform/shipment'

function makeTrackingEvent(overrides: Partial<DhlParcelDeTrackingEvent> = {}): DhlParcelDeTrackingEvent {
  return {
    timestamp: '2024-03-15T10:30:00Z',
    status: 'transit',
    statusCode: 'transit',
    description: 'In transit',
    location: { address: { addressLocality: 'Bonn', countryCode: 'DE', postalCode: '53113' } },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: { id?: string; status?: string | null; events?: DhlParcelDeTrackingEvent[] } = {}): DhlParcelDeTrackingResponse {
  return {
    shipments: [
      {
        id: overrides.id ?? '00340434292135100186',
        status: overrides.status ?? 'transit',
        events: overrides.events ?? [
          makeTrackingEvent({ statusCode: 'pre-transit', status: 'pre-transit', description: 'Label created' }),
          makeTrackingEvent(),
        ],
      },
    ],
  }
}

function makeShipment(overrides: Partial<DhlParcelDeShipment> = {}): DhlParcelDeShipment {
  return {
    shipmentId: 'shp-dhlde-001',
    trackingNumber: '00340434292135100186',
    status: 'transit',
    serviceCode: 'V01PAK',
    weight: 1.8,
    weightUnit: 'kg',
    sender: { name: 'Shop', street1: 'Hauptstr 1', city: 'Bonn', postalCode: '53113', country: 'DE' },
    recipient: { name: 'Max', street1: 'Musterstr 2', city: 'Berlin', postalCode: '10115', country: 'DE' },
    labelUrl: 'https://api-eu.dhl.com/labels/shp-dhlde-001.pdf',
    reference: 'REF-DE-1',
    createdAt: '2024-03-15T09:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('DhlParcelDe transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps fields to canonical event', () => {
    const e = transformTracking(makeTrackingResponse())[0]
    expect(e.trackingNumber).toBe('00340434292135100186')
    expect(e.carrierId).toBe('dhl-parcel-de')
    expect(e.status).toBe('PRE_TRANSIT')
    expect(e.description).toBe('Label created')
    expect(e.location?.city).toBe('Bonn')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('passes metadata through', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits fallback event when events empty', () => {
    const r = transformTracking(makeTrackingResponse({ events: [], status: 'delivered' }))
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('DELIVERED')
  })

  it('handles null location', () => {
    const r = transformTracking(makeTrackingResponse({ events: [makeTrackingEvent({ location: null })] }))
    expect(r[0].location).toBeUndefined()
  })

  it('maps all status codes', () => {
    const cases: [string, string][] = [
      ['pre-transit', 'PRE_TRANSIT'],
      ['transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['available_for_pickup', 'AVAILABLE_FOR_PICKUP'],
      ['return_to_sender', 'RETURN_TO_SENDER'],
      ['failure', 'FAILURE'],
      ['unknown', 'UNKNOWN'],
      ['weird', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const r = transformTracking(makeTrackingResponse({ events: [makeTrackingEvent({ statusCode: code, status: code })] }))
      expect(r[0].status).toBe(expected)
    }
  })

  it('handles multiple shipments', () => {
    const raw: DhlParcelDeTrackingResponse = {
      shipments: [
        { id: 'A', events: [makeTrackingEvent()] },
        { id: 'B', events: [makeTrackingEvent({ statusCode: 'delivered', status: 'delivered' })] },
      ],
    }
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
    expect(events[1].status).toBe('DELIVERED')
  })
})

describe('DhlParcelDe transformShipment', () => {
  it('maps canonical fields', () => {
    const s = transformShipment(makeShipment())
    expect(s.id).toBe('shp-dhlde-001')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.trackingNumber).toBe('00340434292135100186')
    expect(s.carrierId).toBe('dhl-parcel-de')
    expect(s.serviceCode).toBe('V01PAK')
  })

  it('maps addresses and weight', () => {
    const s = transformShipment(makeShipment())
    expect(s.originAddress?.city).toBe('Bonn')
    expect(s.destinationAddress?.city).toBe('Berlin')
    expect(s.totalWeight?.value).toBe(1.8)
    expect(s.totalWeight?.unit).toBe('kg')
  })

  it('passes metadata through', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing fields gracefully', () => {
    const s = transformShipment(makeShipment({
      weight: null, weightUnit: null, labelUrl: null, sender: null, recipient: null,
      serviceCode: null, status: null, reference: null, createdAt: null, updatedAt: null, trackingNumber: null,
    }))
    expect(s.totalWeight).toBeUndefined()
    expect(s.originAddress).toBeUndefined()
    expect(s.status).toBe('UNKNOWN')
  })

  it('maps statuses', () => {
    const cases: [string | null, string][] = [
      ['created', 'LABEL_CREATED'],
      ['transit', 'IN_TRANSIT'],
      ['delivered', 'DELIVERED'],
      ['exception', 'EXCEPTION'],
      ['returned', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })
})
