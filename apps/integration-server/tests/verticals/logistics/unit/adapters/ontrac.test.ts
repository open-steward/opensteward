import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type OnTracTrackingResponse,
  type OnTracTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/ontrac/transform/tracking'
import {
  transformShipment,
  type OnTracShipment,
} from '../../../../../src/verticals/logistics/adapters/ontrac/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<OnTracTrackingEvent> = {}): OnTracTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Package in transit',
    timestamp: '2024-05-20T12:00:00Z',
    location: 'Los Angeles, CA',
    facility: 'LAX-01',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<OnTracTrackingResponse> = {}): OnTracTrackingResponse {
  return {
    tracking_number: 'D10012345678',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'PICKED_UP', description: 'Package picked up', location: 'San Francisco, CA' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<OnTracShipment> = {}): OnTracShipment {
  return {
    shipment_id: 'shp-ot-001',
    tracking_number: 'D10012345678',
    status: 'PICKED_UP',
    service_code: 'GROUND',
    label_url: 'https://api.ontrac.com/labels/shp-ot-001.pdf',
    weight: 3.0,
    weight_unit: 'lb',
    sender: {
      name: 'Jane Doe',
      street1: '123 Market St',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94105',
      country: 'US',
    },
    recipient: {
      name: 'John Smith',
      street1: '456 Hollywood Blvd',
      city: 'Los Angeles',
      state: 'CA',
      postal_code: '90028',
      country: 'US',
    },
    reference: 'ORD-5678',
    created_at: '2024-05-20T08:00:00Z',
    updated_at: '2024-05-20T12:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    expect(transformTracking(raw)).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]

    expect(event.trackingNumber).toBe('D10012345678')
    expect(event.carrierId).toBe('ontrac')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Package picked up')
    expect(event.location?.city).toBe('San Francisco, CA')
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
      ['PICKED_UP', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
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

    expect(result.id).toBe('shp-ot-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('D10012345678')
    expect(result.carrierId).toBe('ontrac')
    expect(result.serviceCode).toBe('GROUND')
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.name).toBe('John Smith')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(3.0)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null, weight_unit: null, label_url: null, sender: null,
      recipient: null, service_code: null, status: null, tracking_number: null,
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
      ['PICKED_UP', 'PENDING'],
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
      expect(transformShipment(makeShipment({ status })).status).toBe(expected)
    }
  })
})
