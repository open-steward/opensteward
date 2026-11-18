import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type DhlEcommerceTrackingResponse,
  type DhlEcommerceTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/dhl-ecommerce/transform/tracking'
import {
  transformShipment,
  type DhlEcommerceShipment,
} from '../../../../../src/verticals/logistics/adapters/dhl-ecommerce/transform/shipment'

function makeTrackingEvent(overrides: Partial<DhlEcommerceTrackingEvent> = {}): DhlEcommerceTrackingEvent {
  return {
    timestamp: '2024-03-15T10:30:00Z',
    status: 'transit',
    statusCode: 'transit',
    description: 'In transit',
    location: {
      address: { addressLocality: 'Leipzig', countryCode: 'DE', postalCode: '04109' },
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: { trackingNumber?: string; shipmentId?: string | null; status?: string | null; events?: DhlEcommerceTrackingEvent[] } = {}): DhlEcommerceTrackingResponse {
  return {
    packages: [
      {
        trackingNumber: overrides.trackingNumber ?? 'GM123456789DE',
        shipmentId: overrides.shipmentId ?? 'SHIP-DE-1',
        status: overrides.status ?? 'transit',
        events: overrides.events ?? [
          makeTrackingEvent({ statusCode: 'pre-transit', status: 'pre-transit', description: 'Label created' }),
          makeTrackingEvent(),
        ],
      },
    ],
  }
}

function makeShipment(overrides: Partial<DhlEcommerceShipment> = {}): DhlEcommerceShipment {
  return {
    shipmentId: 'shp-dhle-001',
    trackingNumber: 'GM123456789DE',
    status: 'transit',
    serviceCode: 'PARCEL_INTL',
    weight: 2.5,
    weightUnit: 'kg',
    sender: { name: 'ACME', street1: 'Alexanderplatz 1', city: 'Berlin', postalCode: '10178', country: 'DE' },
    recipient: { name: 'John Doe', street1: '10 King St', city: 'London', postalCode: 'SW1A 1AA', country: 'GB' },
    labelUrl: 'https://api.dhlecs.com/labels/shp-dhle-001.pdf',
    reference: 'REF-DHLE-001',
    createdAt: '2024-03-15T09:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('DhlEcommerce transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps fields to canonical event', () => {
    const e = transformTracking(makeTrackingResponse())[0]
    expect(e.trackingNumber).toBe('GM123456789DE')
    expect(e.shipmentId).toBe('SHIP-DE-1')
    expect(e.carrierId).toBe('dhl-ecommerce')
    expect(e.status).toBe('PRE_TRANSIT')
    expect(e.description).toBe('Label created')
    expect(e.location?.city).toBe('Leipzig')
    expect(e.location?.country).toBe('DE')
    expect(e.location?.postalCode).toBe('04109')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('passes metadata through', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits fallback event when events empty', () => {
    const r = transformTracking(makeTrackingResponse({ events: [], status: 'pre-transit' }))
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('PRE_TRANSIT')
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

  it('handles multiple packages', () => {
    const raw: DhlEcommerceTrackingResponse = {
      packages: [
        { trackingNumber: 'A1', events: [makeTrackingEvent()] },
        { trackingNumber: 'B1', events: [makeTrackingEvent({ statusCode: 'delivered', status: 'delivered' })] },
      ],
    }
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
    expect(events[1].status).toBe('DELIVERED')
  })
})

describe('DhlEcommerce transformShipment', () => {
  it('maps canonical fields', () => {
    const s = transformShipment(makeShipment())
    expect(s.id).toBe('shp-dhle-001')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.trackingNumber).toBe('GM123456789DE')
    expect(s.carrierId).toBe('dhl-ecommerce')
    expect(s.serviceCode).toBe('PARCEL_INTL')
    expect(s.reference).toBe('REF-DHLE-001')
    expect(s.createdAt).toBeInstanceOf(Date)
  })

  it('maps addresses and weight', () => {
    const s = transformShipment(makeShipment())
    expect(s.originAddress?.city).toBe('Berlin')
    expect(s.destinationAddress?.city).toBe('London')
    expect(s.totalWeight?.value).toBe(2.5)
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
    expect(s.destinationAddress).toBeUndefined()
    expect(s.labelUrl).toBeUndefined()
    expect(s.status).toBe('UNKNOWN')
  })

  it('maps shipment statuses', () => {
    const cases: [string | null, string][] = [
      ['created', 'LABEL_CREATED'],
      ['transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['exception', 'EXCEPTION'],
      ['returned', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      ['weird', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })
})
