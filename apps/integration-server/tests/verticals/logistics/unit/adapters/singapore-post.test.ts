import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type SingaporePostTrackingResponse,
  type SingaporePostTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/singapore-post/transform/tracking'
import {
  transformShipment,
  type SingaporePostShipment,
} from '../../../../../src/verticals/logistics/adapters/singapore-post/transform/shipment'
import {
  transformRate,
  type SingaporePostRate,
} from '../../../../../src/verticals/logistics/adapters/singapore-post/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<SingaporePostTrackingEvent> = {}): SingaporePostTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Parcel in transit to destination',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Singapore Processing Centre',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<SingaporePostTrackingResponse> = {}): SingaporePostTrackingResponse {
  return {
    tracking_number: 'SP123456789SG',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'POSTED', description: 'Item posted', location: 'Tampines Post Office' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<SingaporePostShipment> = {}): SingaporePostShipment {
  return {
    shipment_id: 'shp-abc-123',
    tracking_number: 'SP123456789SG',
    status: 'POSTED',
    label_url: 'https://api.singpost.com/labels/shp-abc-123.pdf',
    service_code: 'STANDARD',
    weight: 0.5,
    weight_unit: 'kg',
    sender: {
      name: 'Alice Tan',
      address_line1: '10 Orchard Road',
      city: 'Singapore',
      postal_code: '238840',
      country: 'SG',
    },
    recipient: {
      name: 'Bob Lee',
      address_line1: '1 Raffles Place',
      city: 'Singapore',
      postal_code: '048616',
      country: 'SG',
    },
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

function makeRate(overrides: Partial<SingaporePostRate> = {}): SingaporePostRate {
  return {
    service_code: 'STANDARD',
    service_name: 'Standard Delivery',
    currency: 'SGD',
    total_amount: 5.50,
    transit_days: 3,
    estimated_delivery: '2024-03-18',
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

    expect(event.trackingNumber).toBe('SP123456789SG')
    expect(event.carrierId).toBe('singapore-post')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Item posted')
    expect(event.location?.city).toBe('Tampines Post Office')
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
    expect(events[0].trackingNumber).toBe('SP123456789SG')
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
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['UNSUCCESSFUL', 'FAILURE'],
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
    expect(result.trackingNumber).toBe('SP123456789SG')
    expect(result.carrierId).toBe('singapore-post')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.labelUrl).toContain('shp-abc-123.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Tan')
    expect(result.originAddress?.city).toBe('Singapore')
    expect(result.destinationAddress?.name).toBe('Bob Lee')
    expect(result.destinationAddress?.city).toBe('Singapore')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(0.5)
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
      ['POSTED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['UNSUCCESSFUL', 'EXCEPTION'],
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
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('STANDARD')
    expect(result.carrierId).toBe('singapore-post')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.serviceName).toBe('Standard Delivery')
    expect(result.currency).toBe('SGD')
    expect(result.totalAmount).toBe(5.50)
    expect(result.transitDays).toBe(3)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles null transit_days gracefully', () => {
    const raw = makeRate({ transit_days: null })
    expect(transformRate(raw).transitDays).toBeUndefined()
  })
})
