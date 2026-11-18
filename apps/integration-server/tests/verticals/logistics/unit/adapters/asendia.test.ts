import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type AsendiaTrackingResponse,
  type AsendiaTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/asendia/transform/tracking'
import {
  transformShipment,
  type AsendiaShipment,
} from '../../../../../src/verticals/logistics/adapters/asendia/transform/shipment'
import {
  transformRate,
  type AsendiaRate,
} from '../../../../../src/verticals/logistics/adapters/asendia/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<AsendiaTrackingEvent> = {}): AsendiaTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Zurich Hub',
    country: 'CH',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<AsendiaTrackingResponse> = {}): AsendiaTrackingResponse {
  return {
    tracking_number: 'AS123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'POSTED', description: 'Item posted', location: 'Geneva', country: 'CH' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<AsendiaShipment> = {}): AsendiaShipment {
  return {
    shipment_id: 'shp-as-001',
    tracking_number: 'AS123456789',
    status: 'POSTED',
    service_code: 'INTL_PRIORITY',
    weight: 250,
    weight_unit: 'g',
    sender: {
      name: 'Alice Sender',
      address_line1: '10 Bahnhofstrasse',
      city: 'Zurich',
      postal_code: '8001',
      country: 'CH',
    },
    recipient: {
      name: 'Bob Receiver',
      address_line1: '100 Champs-Elysees',
      city: 'Paris',
      postal_code: '75008',
      country: 'FR',
    },
    destination_country: 'FR',
    reference: 'ORDER-EU-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeRate(overrides: Partial<AsendiaRate> = {}): AsendiaRate {
  return {
    rate_id: 'rate-as-001',
    service_code: 'INTL_PRIORITY',
    service_name: 'International Priority',
    total_amount: 15.50,
    currency: 'USD',
    transit_days: 5,
    estimated_delivery_at: '2024-03-20T00:00:00Z',
    guaranteed: false,
    created_at: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Asendia transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('AS123456789')
    expect(event.carrierId).toBe('asendia')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Item posted')
    expect(event.location?.city).toBe('Geneva')
    expect(event.location?.country).toBe('CH')
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
    expect(events[0].trackingNumber).toBe('AS123456789')
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
      ['POSTED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['CUSTOMS', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURN_TO_SENDER'],
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

describe('Asendia transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-as-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('AS123456789')
    expect(result.carrierId).toBe('asendia')
    expect(result.serviceCode).toBe('INTL_PRIORITY')
    expect(result.reference).toBe('ORDER-EU-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('Zurich')
    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.city).toBe('Paris')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(250)
    expect(result.totalWeight?.unit).toBe('g')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null,
      weight_unit: null,
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
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['POSTED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['CUSTOMS', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURNED'],
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

describe('Asendia transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('rate-as-001')
    expect(result.carrierId).toBe('asendia')
    expect(result.serviceCode).toBe('INTL_PRIORITY')
    expect(result.serviceName).toBe('International Priority')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(15.50)
    expect(result.transitDays).toBe(5)
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
