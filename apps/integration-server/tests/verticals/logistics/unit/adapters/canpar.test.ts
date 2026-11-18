import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type CanparTrackingResponse,
  type CanparTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/canpar/transform/tracking'
import {
  transformShipment,
  type CanparShipment,
} from '../../../../../src/verticals/logistics/adapters/canpar/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<CanparTrackingEvent> = {}): CanparTrackingEvent {
  return {
    code: 'IT',
    codeDescription: 'In transit',
    local_date_time: '2024-03-15T10:30:00',
    address: {
      city: 'Mississauga',
      province: 'ON',
      country: 'CA',
      postal_code: 'L5N 1A1',
    },
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: { barcode?: string; events?: CanparTrackingEvent[] } = {},
): CanparTrackingResponse {
  return {
    barcode: overrides.barcode ?? 'CNP0000000001',
    status: 'IT',
    events: overrides.events ?? [
      makeEvent({ code: 'PIC', codeDescription: 'Picked up' }),
      makeEvent(),
    ],
  }
}

function makeShipment(overrides: Partial<CanparShipment> = {}): CanparShipment {
  return {
    id: 'cnp-shp-001',
    barcode: 'CNP0000000001',
    status: 'IN_TRANSIT',
    service_type: 'GROUND',
    reported_weight: 4,
    weight_unit: 'lb',
    pickup_address: {
      name: 'Sender Co',
      street1: '10 Canpar Way',
      city: 'Mississauga',
      state: 'ON',
      postal_code: 'L5N 1A1',
      country: 'CA',
    },
    delivery_address: {
      name: 'Receiver Co',
      street1: '200 Rue Sainte-Catherine',
      city: 'Montreal',
      state: 'QC',
      postal_code: 'H2X 1K9',
      country: 'CA',
    },
    label_url: 'https://canpar.example/labels/cnp-shp-001.pdf',
    user_reference: 'REF-CNP-001',
    created_date: '2024-03-15T09:00:00Z',
    updated_date: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Canpar transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]
    expect(event.trackingNumber).toBe('CNP0000000001')
    expect(event.carrierId).toBe('canpar')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Picked up')
    expect(event.location?.city).toBe('Mississauga')
    expect(event.location?.state).toBe('ON')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits an UNKNOWN fallback when events are empty', () => {
    const events = transformTracking({ barcode: 'CNP-EMPTY', events: [] })
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles null address gracefully', () => {
    const raw = makeTrackingResponse({ events: [makeEvent({ address: null })] })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('maps all event codes', () => {
    const cases: [string, string][] = [
      ['ORD', 'PRE_TRANSIT'],
      ['PIC', 'PRE_TRANSIT'],
      ['IT', 'IN_TRANSIT'],
      ['TRN', 'IN_TRANSIT'],
      ['OFD', 'OUT_FOR_DELIVERY'],
      ['DLV', 'DELIVERED'],
      ['POD', 'DELIVERED'],
      ['HFP', 'AVAILABLE_FOR_PICKUP'],
      ['RTS', 'RETURN_TO_SENDER'],
      ['EXC', 'FAILURE'],
      ['???', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const raw = makeTrackingResponse({ events: [makeEvent({ code })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })

  it('handles null events collection', () => {
    const events = transformTracking({ barcode: 'B', events: null })
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('Canpar transformShipment', () => {
  it('maps canonical fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('cnp-shp-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('CNP0000000001')
    expect(result.carrierId).toBe('canpar')
    expect(result.serviceCode).toBe('GROUND')
    expect(result.reference).toBe('REF-CNP-001')
  })

  it('maps addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.city).toBe('Mississauga')
    expect(result.destinationAddress?.city).toBe('Montreal')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(4)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      reported_weight: null,
      weight_unit: null,
      label_url: null,
      pickup_address: null,
      delivery_address: null,
      service_type: null,
      status: null,
      user_reference: null,
      created_date: null,
      updated_date: null,
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
