import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type BlueDartTrackingResponse,
  type BlueDartTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/bluedart/transform/tracking'
import {
  transformShipment,
  type BlueDartShipment,
} from '../../../../../src/verticals/logistics/adapters/bluedart/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<BlueDartTrackingEvent> = {}): BlueDartTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    timestamp: '2024-11-10T09:00:00Z',
    location: 'Mumbai Hub',
    center: 'MUM-01',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<BlueDartTrackingResponse> = {}): BlueDartTrackingResponse {
  return {
    waybill_number: 'BD123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'BOOKED', description: 'Shipment booked', location: 'Delhi' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<BlueDartShipment> = {}): BlueDartShipment {
  return {
    waybill_number: 'BD123456789',
    status: 'BOOKED',
    service_code: 'DART_APEX',
    label_url: 'https://api.bluedart.com/labels/BD123456789.pdf',
    weight: 2.0,
    weight_unit: 'kg',
    sender: {
      name: 'Rajesh Kumar',
      address_line1: '123 MG Road',
      city: 'Delhi',
      state: 'Delhi',
      postal_code: '110001',
      country: 'IN',
    },
    recipient: {
      name: 'Priya Singh',
      address_line1: '456 Carter Road',
      city: 'Mumbai',
      state: 'Maharashtra',
      postal_code: '400050',
      country: 'IN',
    },
    reference: 'IN-ORD-001',
    created_at: '2024-11-10T08:00:00Z',
    updated_at: '2024-11-10T09:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]

    expect(event.trackingNumber).toBe('BD123456789')
    expect(event.carrierId).toBe('bluedart')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment booked')
    expect(event.location?.city).toBe('Delhi')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const events = transformTracking(makeTrackingResponse({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles null location gracefully', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ location: null })] })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['BOOKED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['NOT_DELIVERED', 'FAILURE'],
      ['RTO', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const result = transformShipment(makeShipment())

    expect(result.id).toBe('BD123456789')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('BD123456789')
    expect(result.carrierId).toBe('bluedart')
    expect(result.serviceCode).toBe('DART_APEX')
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Rajesh Kumar')
    expect(result.destinationAddress?.name).toBe('Priya Singh')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null, weight_unit: null, label_url: null, sender: null,
      recipient: null, service_code: null, status: null,
      reference: null, created_at: null, updated_at: null,
    })
    const result = transformShipment(raw)
    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['BOOKED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['NOT_DELIVERED', 'EXCEPTION'],
      ['RTO', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })
})
