import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type NationexTrackingResponse,
  type NationexTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/nationex/transform/tracking'
import {
  transformShipment,
  type NationexShipment,
} from '../../../../../src/verticals/logistics/adapters/nationex/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<NationexTrackingEvent> = {}): NationexTrackingEvent {
  return {
    statusCode: 'IN_TRANSIT',
    statusDescription: 'Package in transit',
    eventDate: '2024-03-15T10:30:00Z',
    city: 'Laval',
    stateProvince: 'QC',
    country: 'CA',
    postalCode: 'H7P 0A1',
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: { parcelId?: string; trackingNumber?: string; events?: NationexTrackingEvent[] } = {},
): NationexTrackingResponse {
  return {
    parcelId: overrides.parcelId ?? 'NX-PARCEL-001',
    trackingNumber: overrides.trackingNumber ?? 'NX0000000001',
    status: 'IN_TRANSIT',
    events: overrides.events ?? [
      makeEvent({ statusCode: 'CREATED', statusDescription: 'Shipment created' }),
      makeEvent(),
    ],
  }
}

function makeShipment(overrides: Partial<NationexShipment> = {}): NationexShipment {
  return {
    shipmentId: 'nx-shp-001',
    trackingNumber: 'NX0000000001',
    status: 'IN_TRANSIT',
    serviceType: 'GROUND',
    totalWeight: 3.1,
    weightUnit: 'kg',
    shipper: {
      name: 'Shipper Inc',
      street1: '123 Rue des Expediteurs',
      city: 'Laval',
      state: 'QC',
      postalCode: 'H7P 0A1',
      country: 'CA',
    },
    consignee: {
      name: 'Consignee Ltd',
      street1: '456 Rue des Destinataires',
      city: 'Quebec City',
      state: 'QC',
      postalCode: 'G1K 7X2',
      country: 'CA',
    },
    labelUrl: 'https://nationex.example/labels/nx-shp-001.pdf',
    customerReference: 'REF-NX-001',
    createdAt: '2024-03-15T09:00:00Z',
    updatedAt: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Nationex transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]
    expect(event.trackingNumber).toBe('NX0000000001')
    expect(event.carrierId).toBe('nationex')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment created')
    expect(event.location?.city).toBe('Laval')
    expect(event.location?.state).toBe('QC')
    expect(event.location?.country).toBe('CA')
    expect(event.location?.postalCode).toBe('H7P 0A1')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits an UNKNOWN fallback when events is empty', () => {
    const events = transformTracking({
      parcelId: 'NX-EMPTY',
      trackingNumber: 'NX-EMPTY',
      events: [],
    })
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles missing location fields gracefully', () => {
    const raw = makeTrackingResponse({
      events: [
        makeEvent({ city: null, stateProvince: null, country: null, postalCode: null }),
      ],
    })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('maps all status codes correctly', () => {
    const cases: [string, string][] = [
      ['CREATED', 'PRE_TRANSIT'],
      ['PICKUP_SCHEDULED', 'PRE_TRANSIT'],
      ['PICKED_UP', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['AT_FACILITY', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['HELD_FOR_PICKUP', 'AVAILABLE_FOR_PICKUP'],
      ['AVAILABLE_FOR_PICKUP', 'AVAILABLE_FOR_PICKUP'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['RETURN_TO_SENDER', 'RETURN_TO_SENDER'],
      ['EXCEPTION', 'FAILURE'],
      ['UNDELIVERABLE', 'FAILURE'],
      ['DELIVERY_FAILED', 'FAILURE'],
      ['bogus', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const raw = makeTrackingResponse({ events: [makeEvent({ statusCode: code })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })

  it('falls back to parcelId when trackingNumber is missing', () => {
    const raw: NationexTrackingResponse = {
      parcelId: 'NX-PARCEL-ONLY',
      trackingNumber: null,
      events: [makeEvent()],
    }
    expect(transformTracking(raw)[0].trackingNumber).toBe('NX-PARCEL-ONLY')
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('Nationex transformShipment', () => {
  it('maps canonical fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('nx-shp-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('NX0000000001')
    expect(result.carrierId).toBe('nationex')
    expect(result.serviceCode).toBe('GROUND')
    expect(result.reference).toBe('REF-NX-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.city).toBe('Laval')
    expect(result.destinationAddress?.city).toBe('Quebec City')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(3.1)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      totalWeight: null,
      weightUnit: null,
      labelUrl: null,
      shipper: null,
      consignee: null,
      serviceType: null,
      status: null,
      customerReference: null,
      createdAt: null,
      updatedAt: null,
    })
    const result = transformShipment(raw)
    expect(result.totalWeight).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.status).toBe('UNKNOWN')
  })

  it('maps all shipment statuses', () => {
    const cases: [string | null, string][] = [
      ['CREATED', 'LABEL_CREATED'],
      ['LABEL_CREATED', 'LABEL_CREATED'],
      ['PICKED_UP', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['VOIDED', 'CANCELLED'],
      ['other', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })
})
