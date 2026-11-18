import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type EtsExpressTrackingResponse,
  type EtsExpressTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/ets-express/transform/tracking'
import {
  transformShipment,
  type EtsExpressShipment,
} from '../../../../../src/verticals/logistics/adapters/ets-express/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<EtsExpressTrackingEvent> = {}): EtsExpressTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Dubai Hub',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<EtsExpressTrackingResponse> = {}): EtsExpressTrackingResponse {
  return {
    tracking_number: 'ETS123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'BOOKED', description: 'Shipment booked', location: 'Dubai' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<EtsExpressShipment> = {}): EtsExpressShipment {
  return {
    shipment_id: 'shp-abc-123',
    tracking_number: 'ETS123456789',
    status: 'BOOKED',
    label_url: 'https://api.etsexpress.com/labels/shp-abc-123.pdf',
    service_code: 'EXPRESS',
    weight: 3.0,
    weight_unit: 'kg',
    sender: {
      name: 'Ahmed',
      address_line1: '10 Sheikh Zayed Road',
      city: 'Dubai',
      postal_code: '00000',
      country: 'AE',
    },
    recipient: {
      name: 'Priya',
      address_line1: '1 MG Road',
      city: 'Bangalore',
      postal_code: '560001',
      country: 'IN',
    },
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('ETS123456789')
    expect(event.carrierId).toBe('ets-express')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment booked')
    expect(event.location?.city).toBe('Dubai')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTrackingResponse({ events: [] })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('ETS123456789')
  })

  it('handles null location gracefully', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ location: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['BOOKED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ status })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-abc-123')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('ETS123456789')
    expect(result.carrierId).toBe('ets-express')
    expect(result.serviceCode).toBe('EXPRESS')
    expect(result.labelUrl).toContain('shp-abc-123.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Ahmed')
    expect(result.originAddress?.city).toBe('Dubai')
    expect(result.destinationAddress?.name).toBe('Priya')
    expect(result.destinationAddress?.city).toBe('Bangalore')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(3.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null,
      weight_unit: null,
      label_url: null,
      sender: null,
      recipient: null,
      service_code: null,
      status: null,
      created_at: null,
      updated_at: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['BOOKED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipment({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
