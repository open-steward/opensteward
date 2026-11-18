import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type CanadaPostTrackingResponse,
  type CanadaPostOccurrence,
} from '../../../../../src/verticals/logistics/adapters/canada-post/transform/tracking'
import {
  transformShipment,
  type CanadaPostShipment,
} from '../../../../../src/verticals/logistics/adapters/canada-post/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeOccurrence(overrides: Partial<CanadaPostOccurrence> = {}): CanadaPostOccurrence {
  return {
    'event-identifier': '500',
    'event-date': '2024-03-15',
    'event-time': '10:30:00',
    'event-description': 'Item in transit',
    'event-site': 'Toronto',
    'event-province': 'ON',
    'event-retail-name': null,
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: { pin?: string; occurrences?: CanadaPostOccurrence[] } = {},
): CanadaPostTrackingResponse {
  return {
    'tracking-detail': {
      pin: overrides.pin ?? '1234567890123456',
      'service-name': 'Expedited Parcel',
      'expected-delivery-date': '2024-03-18',
      'actual-delivery-date': null,
      'significant-events': {
        occurrence: overrides.occurrences ?? [
          makeOccurrence({ 'event-identifier': '20', 'event-description': 'Order info received' }),
          makeOccurrence(),
        ],
      },
    },
  }
}

function makeShipment(overrides: Partial<CanadaPostShipment> = {}): CanadaPostShipment {
  return {
    'shipment-id': 'shp-cp-001',
    'tracking-pin': '1234567890123456',
    status: 'in-transit',
    'service-code': 'DOM.EP',
    weight: 2.5,
    'weight-unit': 'kg',
    sender: {
      name: 'Jane Doe',
      street1: '123 Queen St',
      city: 'Toronto',
      state: 'ON',
      postalCode: 'M5H 2N2',
      country: 'CA',
    },
    delivery: {
      name: 'John Smith',
      street1: '456 Portage Ave',
      city: 'Winnipeg',
      state: 'MB',
      postalCode: 'R3B 2E8',
      country: 'CA',
    },
    'label-url': 'https://cp.example/labels/shp-cp-001.pdf',
    reference: 'REF-CP-001',
    'created-at': '2024-03-15T09:00:00Z',
    'updated-at': '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('CanadaPost transformTracking', () => {
  it('produces one event per occurrence', () => {
    const events = transformTracking(makeTrackingResponse())
    expect(events).toHaveLength(2)
  })

  it('maps occurrence fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]
    expect(event.trackingNumber).toBe('1234567890123456')
    expect(event.carrierId).toBe('canada-post')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Order info received')
    expect(event.location?.city).toBe('Toronto')
    expect(event.location?.state).toBe('ON')
    expect(event.location?.country).toBe('CA')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const events = transformTracking(makeTrackingResponse())
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single UNKNOWN event when occurrences are empty', () => {
    const raw: CanadaPostTrackingResponse = {
      'tracking-detail': {
        pin: 'ABC',
        'significant-events': { occurrence: [] },
      },
    }
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles missing location gracefully', () => {
    const raw = makeTrackingResponse({
      occurrences: [makeOccurrence({ 'event-site': null, 'event-province': null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all event identifiers correctly', () => {
    const cases: [string, string][] = [
      ['20', 'PRE_TRANSIT'],
      ['100', 'PRE_TRANSIT'],
      ['500', 'IN_TRANSIT'],
      ['700', 'IN_TRANSIT'],
      ['1496', 'OUT_FOR_DELIVERY'],
      ['1408', 'DELIVERED'],
      ['1441', 'AVAILABLE_FOR_PICKUP'],
      ['1700', 'RETURN_TO_SENDER'],
      ['1800', 'FAILURE'],
      ['99999', 'UNKNOWN'],
    ]
    for (const [id, expected] of cases) {
      const raw = makeTrackingResponse({
        occurrences: [makeOccurrence({ 'event-identifier': id })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })

  it('returns empty array when tracking-detail is missing', () => {
    const events = transformTracking({} as CanadaPostTrackingResponse)
    expect(events).toEqual([])
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('CanadaPost transformShipment', () => {
  it('maps canonical fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('shp-cp-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('1234567890123456')
    expect(result.carrierId).toBe('canada-post')
    expect(result.serviceCode).toBe('DOM.EP')
    expect(result.reference).toBe('REF-CP-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.city).toBe('Toronto')
    expect(result.destinationAddress?.city).toBe('Winnipeg')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null,
      'weight-unit': null,
      'label-url': null,
      sender: null,
      delivery: null,
      'service-code': null,
      status: null,
      reference: null,
      'created-at': null,
      'updated-at': null,
    })
    const result = transformShipment(raw)
    expect(result.totalWeight).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.status).toBe('UNKNOWN')
  })

  it('maps all shipment statuses', () => {
    const cases: [string | null, string][] = [
      ['created', 'LABEL_CREATED'],
      ['in-transit', 'IN_TRANSIT'],
      ['out-for-delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['exception', 'EXCEPTION'],
      ['returned', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })
})
