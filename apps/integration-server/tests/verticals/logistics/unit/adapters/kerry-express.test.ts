import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type KerryExpressTrackingResponse,
  type KerryExpressTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/kerry-express/transform/tracking'
import {
  transformShipment,
  type KerryExpressShipment,
} from '../../../../../src/verticals/logistics/adapters/kerry-express/transform/shipment'
import {
  transformRate,
  type KerryExpressRate,
} from '../../../../../src/verticals/logistics/adapters/kerry-express/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<KerryExpressTrackingEvent> = {}): KerryExpressTrackingEvent {
  return {
    status_code: 'IN_TRANSIT',
    status_description: 'Parcel in transit to destination',
    timestamp: '2024-10-15T10:00:00Z',
    location: 'Bangkok Hub',
    branch: 'BKK-01',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<KerryExpressTrackingResponse> = {}): KerryExpressTrackingResponse {
  return {
    tracking_number: 'KEX123456789TH',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status_code: 'PICKED_UP', status_description: 'Parcel picked up from sender', location: 'Chiang Mai' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<KerryExpressShipment> = {}): KerryExpressShipment {
  return {
    shipment_id: 'shp-kex-001',
    tracking_number: 'KEX123456789TH',
    status: 'PICKED_UP',
    label_url: 'https://api.kerryexpress.com/labels/shp-kex-001.pdf',
    service_code: 'NEXT_DAY',
    weight: 1.0,
    weight_unit: 'kg',
    sender: {
      name: 'Somchai Jaidee',
      address_line1: '99 Sukhumvit Road',
      city: 'Bangkok',
      postal_code: '10110',
      country: 'TH',
    },
    recipient: {
      name: 'Nattaporn Srisuk',
      address_line1: '55 Nimmanhaemin Road',
      city: 'Chiang Mai',
      postal_code: '50200',
      country: 'TH',
    },
    created_at: '2024-10-15T08:00:00Z',
    updated_at: '2024-10-15T10:00:00Z',
    ...overrides,
  }
}

function makeRate(overrides: Partial<KerryExpressRate> = {}): KerryExpressRate {
  return {
    rate_id: 'R-KEX-001',
    service_code: 'NEXT_DAY',
    service_name: 'Next Day Delivery',
    total: 150.00,
    currency: 'THB',
    transit_days: 1,
    estimated_delivery: '2024-10-16T18:00:00Z',
    created_at: '2024-10-15T08:00:00Z',
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

    expect(event.trackingNumber).toBe('KEX123456789TH')
    expect(event.carrierId).toBe('kerry-express')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Parcel picked up from sender')
    expect(event.location?.city).toBe('Chiang Mai')
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
    expect(events[0].trackingNumber).toBe('KEX123456789TH')
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
      ['PICKED_UP', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED_DELIVERY', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [statusCode, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ status_code: statusCode })],
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

    expect(result.id).toBe('shp-kex-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('KEX123456789TH')
    expect(result.carrierId).toBe('kerry-express')
    expect(result.serviceCode).toBe('NEXT_DAY')
    expect(result.labelUrl).toContain('shp-kex-001.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Somchai Jaidee')
    expect(result.originAddress?.city).toBe('Bangkok')
    expect(result.destinationAddress?.name).toBe('Nattaporn Srisuk')
    expect(result.destinationAddress?.city).toBe('Chiang Mai')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(1.0)
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
      ['PICKED_UP', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED_DELIVERY', 'EXCEPTION'],
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

describe('transformRate', () => {
  it('maps canonical rate fields', () => {
    const result = transformRate(makeRate())

    expect(result.id).toBe('R-KEX-001')
    expect(result.carrierId).toBe('kerry-express')
    expect(result.serviceCode).toBe('NEXT_DAY')
    expect(result.serviceName).toBe('Next Day Delivery')
    expect(result.currency).toBe('THB')
    expect(result.totalAmount).toBe(150.00)
    expect(result.transitDays).toBe(1)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      rate_id: null, service_code: null, service_name: null,
      total: null, currency: null, transit_days: null,
      estimated_delivery: null, created_at: null,
    })
    const result = transformRate(raw)
    expect(result.id).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.currency).toBe('THB')
    expect(result.transitDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })
})
