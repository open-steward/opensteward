import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ZtoExpressTrackingResponse,
  type ZtoExpressTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/zto-express/transform/tracking'
import {
  transformShipment,
  type ZtoExpressOrder,
} from '../../../../../src/verticals/logistics/adapters/zto-express/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<ZtoExpressTrackingEvent> = {}): ZtoExpressTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Parcel in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Hangzhou Sorting Centre',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<ZtoExpressTrackingResponse> = {}): ZtoExpressTrackingResponse {
  return {
    tracking_number: 'ZTO123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'COLLECTED', description: 'Parcel collected', location: 'Hangzhou' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeOrder(overrides: Partial<ZtoExpressOrder> = {}): ZtoExpressOrder {
  return {
    order_id: 'ord-abc-123',
    tracking_number: 'ZTO123456789',
    status: 'COLLECTED',
    label_url: 'https://open.zto.com/labels/ord-abc-123.pdf',
    service_code: 'STANDARD',
    weight: 1.0,
    weight_unit: 'kg',
    sender: {
      name: 'Liu Yang',
      address_line1: '200 West Lake Road',
      city: 'Hangzhou',
      postal_code: '310000',
      country: 'CN',
    },
    recipient: {
      name: 'Zhao Ming',
      address_line1: '88 Jiefang Road',
      city: 'Wuhan',
      postal_code: '430000',
      country: 'CN',
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

    expect(event.trackingNumber).toBe('ZTO123456789')
    expect(event.carrierId).toBe('zto-express')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Parcel collected')
    expect(event.location?.city).toBe('Hangzhou')
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
    expect(events[0].trackingNumber).toBe('ZTO123456789')
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
      ['COLLECTED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['DELIVERING', 'OUT_FOR_DELIVERY'],
      ['SIGNED', 'DELIVERED'],
      ['PROBLEM', 'FAILURE'],
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
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.id).toBe('ord-abc-123')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('ZTO123456789')
    expect(result.carrierId).toBe('zto-express')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.labelUrl).toContain('ord-abc-123.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Liu Yang')
    expect(result.originAddress?.city).toBe('Hangzhou')
    expect(result.destinationAddress?.name).toBe('Zhao Ming')
    expect(result.destinationAddress?.city).toBe('Wuhan')
  })

  it('maps weight', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(1.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeOrder()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeOrder({
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
      ['COLLECTED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['DELIVERING', 'OUT_FOR_DELIVERY'],
      ['SIGNED', 'DELIVERED'],
      ['PROBLEM', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeOrder({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
