import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type DhlFreightTrackingResponse,
  type DhlFreightTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/dhl-freight/transform/tracking'
import {
  transformShipment,
  type DhlFreightShipment,
} from '../../../../../src/verticals/logistics/adapters/dhl-freight/transform/shipment'

function makeTrackingEvent(overrides: Partial<DhlFreightTrackingEvent> = {}): DhlFreightTrackingEvent {
  return {
    timestamp: '2024-03-15T10:30:00Z',
    status: 'transit',
    statusCode: 'transit',
    description: 'In transit',
    location: { city: 'Stockholm', countryCode: 'SE', postalCode: '11122' },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: { shipmentId?: string; status?: string | null; events?: DhlFreightTrackingEvent[] } = {}): DhlFreightTrackingResponse {
  return {
    shipments: [
      {
        shipmentId: overrides.shipmentId ?? 'DHF123456',
        status: overrides.status ?? 'transit',
        events: overrides.events ?? [
          makeTrackingEvent({ statusCode: 'pre-transit', status: 'pre-transit', description: 'Booking received' }),
          makeTrackingEvent(),
        ],
      },
    ],
  }
}

function makeShipment(overrides: Partial<DhlFreightShipment> = {}): DhlFreightShipment {
  return {
    shipmentId: 'shp-dhlf-001',
    trackingNumber: 'DHF123456',
    status: 'transit',
    serviceCode: 'EUROCONNECT',
    weight: 450,
    weightUnit: 'kg',
    sender: { name: 'Warehouse', street1: 'Industrivagen 1', city: 'Stockholm', postalCode: '11122', country: 'SE' },
    recipient: { name: 'Receiver', street1: 'Hauptstr 5', city: 'Hamburg', postalCode: '20095', country: 'DE' },
    labelUrl: 'https://api-eu.dhl.com/freight/labels/shp-dhlf-001.pdf',
    reference: 'REF-F-1',
    createdAt: '2024-03-15T09:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('DhlFreight transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps fields to canonical event', () => {
    const e = transformTracking(makeTrackingResponse())[0]
    expect(e.trackingNumber).toBe('DHF123456')
    expect(e.carrierId).toBe('dhl-freight')
    expect(e.status).toBe('PRE_TRANSIT')
    expect(e.description).toBe('Booking received')
    expect(e.location?.city).toBe('Stockholm')
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
    const raw: DhlFreightTrackingResponse = {
      shipments: [
        { shipmentId: 'A', events: [makeTrackingEvent()] },
        { shipmentId: 'B', events: [makeTrackingEvent({ statusCode: 'delivered', status: 'delivered' })] },
      ],
    }
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
    expect(events[1].status).toBe('DELIVERED')
  })
})

describe('DhlFreight transformShipment', () => {
  it('maps canonical fields', () => {
    const s = transformShipment(makeShipment())
    expect(s.id).toBe('shp-dhlf-001')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.carrierId).toBe('dhl-freight')
    expect(s.serviceCode).toBe('EUROCONNECT')
  })

  it('maps addresses and weight', () => {
    const s = transformShipment(makeShipment())
    expect(s.originAddress?.city).toBe('Stockholm')
    expect(s.destinationAddress?.city).toBe('Hamburg')
    expect(s.totalWeight?.value).toBe(450)
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
