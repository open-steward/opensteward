import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type SagawaTrackingResponse,
  type SagawaTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/sagawa/transform/tracking'
import {
  transformShipment,
  type SagawaShipment,
} from '../../../../../src/verticals/logistics/adapters/sagawa/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<SagawaTrackingEvent> = {}): SagawaTrackingEvent {
  return {
    status_code: 'IN_TRANSIT',
    status_description: 'Parcel in transit to destination hub',
    timestamp: '2024-06-10T08:30:00Z',
    location: 'Tokyo Hub',
    depot: 'TKY-01',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<SagawaTrackingResponse> = {}): SagawaTrackingResponse {
  return {
    tracking_number: 'SGW123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status_code: 'ACCEPTED', status_description: 'Parcel accepted', location: 'Osaka' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<SagawaShipment> = {}): SagawaShipment {
  return {
    shipment_id: 'shp-sgw-001',
    tracking_number: 'SGW123456789',
    status: 'ACCEPTED',
    label_url: 'https://api.sagawa-exp.co.jp/labels/shp-sgw-001.pdf',
    service_code: 'EXPRESS',
    weight: 2.0,
    weight_unit: 'kg',
    sender: {
      name: 'Tanaka Taro',
      address_line1: '1-2-3 Shibuya',
      city: 'Tokyo',
      postal_code: '150-0002',
      country: 'JP',
    },
    recipient: {
      name: 'Suzuki Hanako',
      address_line1: '4-5-6 Umeda',
      city: 'Osaka',
      postal_code: '530-0001',
      country: 'JP',
    },
    created_at: '2024-06-10T07:00:00Z',
    updated_at: '2024-06-10T08:30:00Z',
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

    expect(event.trackingNumber).toBe('SGW123456789')
    expect(event.carrierId).toBe('sagawa')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Parcel accepted')
    expect(event.location?.city).toBe('Osaka')
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
    expect(events[0].trackingNumber).toBe('SGW123456789')
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
      ['ACCEPTED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['HELD', 'FAILURE'],
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

    expect(result.id).toBe('shp-sgw-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('SGW123456789')
    expect(result.carrierId).toBe('sagawa')
    expect(result.serviceCode).toBe('EXPRESS')
    expect(result.labelUrl).toContain('shp-sgw-001.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Tanaka Taro')
    expect(result.originAddress?.city).toBe('Tokyo')
    expect(result.destinationAddress?.name).toBe('Suzuki Hanako')
    expect(result.destinationAddress?.city).toBe('Osaka')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(2.0)
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
      ['ACCEPTED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['HELD', 'EXCEPTION'],
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
