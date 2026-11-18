import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type DhlParcelBnlTrackingResponse,
  type DhlParcelBnlTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/dhl-parcel-bnl/transform/tracking'
import {
  transformShipment,
  type DhlParcelBnlShipment,
} from '../../../../../src/verticals/logistics/adapters/dhl-parcel-bnl/transform/shipment'

function makeTrackingEvent(overrides: Partial<DhlParcelBnlTrackingEvent> = {}): DhlParcelBnlTrackingEvent {
  return {
    timestamp: '2024-03-15T10:30:00Z',
    status: 'transit',
    statusCode: 'transit',
    description: 'In transit',
    location: { city: 'Utrecht', countryCode: 'NL', postalCode: '3511' },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: { barcode?: string; status?: string | null; events?: DhlParcelBnlTrackingEvent[] } = {}): DhlParcelBnlTrackingResponse {
  return {
    barcode: overrides.barcode ?? '3SDHLNL123456789',
    status: overrides.status ?? 'transit',
    events: overrides.events ?? [
      makeTrackingEvent({ statusCode: 'pre-transit', status: 'pre-transit', description: 'Label created' }),
      makeTrackingEvent(),
    ],
  }
}

function makeShipment(overrides: Partial<DhlParcelBnlShipment> = {}): DhlParcelBnlShipment {
  return {
    shipmentId: 'shp-bnl-001',
    trackingNumber: '3SDHLNL123456789',
    status: 'transit',
    serviceCode: 'DOOR',
    weight: 4.1,
    weightUnit: 'kg',
    sender: { name: 'Shop NL', street1: 'Dam 1', city: 'Amsterdam', postalCode: '1012', country: 'NL' },
    recipient: { name: 'Jan', street1: 'Rue 2', city: 'Brussels', postalCode: '1000', country: 'BE' },
    labelUrl: 'https://api-gw.dhlparcel.nl/labels/shp-bnl-001.pdf',
    reference: 'REF-BNL-1',
    createdAt: '2024-03-15T09:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('DhlParcelBnl transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps fields to canonical event', () => {
    const e = transformTracking(makeTrackingResponse())[0]
    expect(e.trackingNumber).toBe('3SDHLNL123456789')
    expect(e.carrierId).toBe('dhl-parcel-bnl')
    expect(e.status).toBe('PRE_TRANSIT')
    expect(e.description).toBe('Label created')
    expect(e.location?.city).toBe('Utrecht')
    expect(e.location?.country).toBe('NL')
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
})

describe('DhlParcelBnl transformShipment', () => {
  it('maps canonical fields', () => {
    const s = transformShipment(makeShipment())
    expect(s.id).toBe('shp-bnl-001')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.carrierId).toBe('dhl-parcel-bnl')
    expect(s.serviceCode).toBe('DOOR')
  })

  it('maps addresses and weight', () => {
    const s = transformShipment(makeShipment())
    expect(s.originAddress?.city).toBe('Amsterdam')
    expect(s.destinationAddress?.city).toBe('Brussels')
    expect(s.totalWeight?.value).toBe(4.1)
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
