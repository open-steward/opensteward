import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type FreightosTrackingResponse,
  type FreightosTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/freightos/transform/tracking'
import {
  transformShipment,
  type FreightosShipment,
} from '../../../../../src/verticals/logistics/adapters/freightos/transform/shipment'
import {
  transformRate,
  type FreightosRate,
} from '../../../../../src/verticals/logistics/adapters/freightos/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<FreightosTrackingEvent> = {}): FreightosTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Shanghai',
    port: 'CNSHA',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<FreightosTrackingResponse> = {}): FreightosTrackingResponse {
  return {
    shipment_id: 'FT-001',
    tracking_number: 'FT123456789',
    booking_reference: 'BK-001',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'BOOKED', description: 'Booking confirmed', location: 'Shanghai', port: 'CNSHA' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<FreightosShipment> = {}): FreightosShipment {
  return {
    shipment_id: 'FT-001',
    booking_reference: 'BK-001',
    tracking_number: 'FT123456789',
    status: 'BOOKED',
    mode: 'ocean',
    service_code: 'FCL_20',
    weight: 5000,
    weight_unit: 'kg',
    origin: {
      name: 'Shanghai Warehouse',
      city: 'Shanghai',
      country: 'CN',
    },
    destination: {
      name: 'LA Distribution',
      city: 'Los Angeles',
      state: 'CA',
      country: 'US',
    },
    reference: 'PO-12345',
    created_at: '2024-03-10T00:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeRate(overrides: Partial<FreightosRate> = {}): FreightosRate {
  return {
    quote_id: 'Q-FT-001',
    service_code: 'FCL_20',
    service_name: '20ft Container Ocean Freight',
    mode: 'ocean',
    total_amount: 2500.00,
    currency: 'USD',
    transit_days: 28,
    estimated_delivery_at: '2024-04-12T00:00:00Z',
    guaranteed: false,
    created_at: '2024-03-10T00:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Freightos transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('FT123456789')
    expect(event.carrierId).toBe('freightos')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Booking confirmed')
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
  })

  it('falls back to booking_reference when tracking_number is null', () => {
    const raw = makeTrackingResponse({ tracking_number: null })
    const events = transformTracking(raw)
    expect(events[0].trackingNumber).toBe('BK-001')
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['BOOKED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['AT_PORT', 'IN_TRANSIT'],
      ['CUSTOMS', 'IN_TRANSIT'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'FAILURE'],
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

describe('Freightos transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('FT-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('FT123456789')
    expect(result.carrierId).toBe('freightos')
    expect(result.serviceCode).toBe('FCL_20')
    expect(result.reference).toBe('PO-12345')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Shanghai Warehouse')
    expect(result.originAddress?.city).toBe('Shanghai')
    expect(result.destinationAddress?.name).toBe('LA Distribution')
    expect(result.destinationAddress?.city).toBe('Los Angeles')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(5000)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('falls back to booking_reference when tracking_number is null', () => {
    const raw = makeShipment({ tracking_number: null })
    const result = transformShipment(raw)
    expect(result.trackingNumber).toBe('BK-001')
  })

  it('falls back to mode when service_code is null', () => {
    const raw = makeShipment({ service_code: null })
    const result = transformShipment(raw)
    expect(result.serviceCode).toBe('ocean')
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null,
      weight_unit: null,
      origin: null,
      destination: null,
      service_code: null,
      mode: null,
      tracking_number: null,
      booking_reference: null,
      reference: null,
      created_at: null,
      updated_at: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['BOOKED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['AT_PORT', 'IN_TRANSIT'],
      ['CUSTOMS', 'IN_TRANSIT'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'EXCEPTION'],
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

describe('Freightos transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('Q-FT-001')
    expect(result.carrierId).toBe('freightos')
    expect(result.serviceCode).toBe('FCL_20')
    expect(result.serviceName).toBe('20ft Container Ocean Freight')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(2500.00)
    expect(result.transitDays).toBe(28)
  })

  it('falls back to mode when service_code is null', () => {
    const raw = makeRate({ service_code: null })
    const result = transformRate(raw)
    expect(result.serviceCode).toBe('ocean')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      quote_id: null,
      service_code: null,
      service_name: null,
      mode: null,
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
