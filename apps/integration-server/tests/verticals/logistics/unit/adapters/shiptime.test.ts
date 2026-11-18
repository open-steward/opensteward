import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ShipTimeTrackingResponse,
  type ShipTimeTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/shiptime/transform/tracking'
import {
  transformShipment,
  type ShipTimeShipment,
} from '../../../../../src/verticals/logistics/adapters/shiptime/transform/shipment'
import {
  transformRate,
  type ShipTimeRate,
} from '../../../../../src/verticals/logistics/adapters/shiptime/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<ShipTimeTrackingEvent> = {}): ShipTimeTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Package in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Toronto, ON',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<ShipTimeTrackingResponse> = {}): ShipTimeTrackingResponse {
  return {
    tracking_number: 'ST123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'LABEL_CREATED', description: 'Label created', location: 'Vancouver, BC' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ShipTimeShipment> = {}): ShipTimeShipment {
  return {
    shipment_id: 'shp-st-001',
    tracking_number: 'ST123456789',
    status: 'LABEL_CREATED',
    label_url: 'https://api.shiptime.com/labels/shp-st-001.pdf',
    service_code: 'CP_EXPEDITED',
    weight: 5.0,
    weight_unit: 'lb',
    sender: {
      name: 'Alice Sender',
      address_line1: '100 Queen St W',
      city: 'Toronto',
      state: 'ON',
      postal_code: 'M5H 2N2',
      country: 'CA',
    },
    recipient: {
      name: 'Bob Receiver',
      address_line1: '200 Burrard St',
      city: 'Vancouver',
      state: 'BC',
      postal_code: 'V6C 3L6',
      country: 'CA',
    },
    reference: 'ORDER-CA-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeRate(overrides: Partial<ShipTimeRate> = {}): ShipTimeRate {
  return {
    rate_id: 'rate-st-001',
    service_code: 'CP_EXPEDITED',
    service_name: 'Canada Post Expedited',
    total_amount: 12.50,
    currency: 'CAD',
    transit_days: 3,
    estimated_delivery_at: '2024-03-18T00:00:00Z',
    guaranteed: false,
    created_at: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('ShipTime transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('ST123456789')
    expect(event.carrierId).toBe('shiptime')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Label created')
    expect(event.location?.city).toBe('Vancouver, BC')
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
    expect(events[0].trackingNumber).toBe('ST123456789')
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
      ['LABEL_CREATED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'FAILURE'],
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

describe('ShipTime transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-st-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('ST123456789')
    expect(result.carrierId).toBe('shiptime')
    expect(result.serviceCode).toBe('CP_EXPEDITED')
    expect(result.reference).toBe('ORDER-CA-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('Toronto')
    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.city).toBe('Vancouver')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(5.0)
    expect(result.totalWeight?.unit).toBe('lb')
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
      reference: null,
      created_at: null,
      updated_at: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['LABEL_CREATED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'EXCEPTION'],
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

// ─── transformRate ──────────────────────────────────────────────────────────

describe('ShipTime transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('rate-st-001')
    expect(result.carrierId).toBe('shiptime')
    expect(result.serviceCode).toBe('CP_EXPEDITED')
    expect(result.serviceName).toBe('Canada Post Expedited')
    expect(result.currency).toBe('CAD')
    expect(result.totalAmount).toBe(12.50)
    expect(result.transitDays).toBe(3)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      rate_id: null,
      service_code: null,
      service_name: null,
      total_amount: null,
      transit_days: null,
      estimated_delivery_at: null,
      guaranteed: null,
      created_at: null,
    })
    const result = transformRate(raw)

    expect(result.id).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
  })
})
