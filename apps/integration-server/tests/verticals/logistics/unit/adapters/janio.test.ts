import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type JanioTrackingResponse,
  type JanioTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/janio/transform/tracking'
import {
  transformShipment,
  type JanioOrder,
} from '../../../../../src/verticals/logistics/adapters/janio/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<JanioTrackingEvent> = {}): JanioTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Parcel in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Singapore Hub',
    country: 'SG',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<JanioTrackingResponse> = {}): JanioTrackingResponse {
  return {
    tracking_number: 'JN123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'CREATED', description: 'Order created', location: 'Singapore', country: 'SG' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeOrder(overrides: Partial<JanioOrder> = {}): JanioOrder {
  return {
    order_id: 'ord-abc-123',
    tracking_number: 'JN123456789',
    status: 'CREATED',
    label_url: 'https://api.janio.asia/labels/ord-abc-123.pdf',
    service_code: 'STANDARD',
    weight: 1.0,
    weight_unit: 'kg',
    sender: {
      name: 'Alice Tan',
      address_line1: '10 Orchard Road',
      city: 'Singapore',
      postal_code: '238840',
      country: 'SG',
    },
    recipient: {
      name: 'Bob Nguyen',
      address_line1: '123 Nguyen Hue',
      city: 'Ho Chi Minh City',
      postal_code: '700000',
      country: 'VN',
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

    expect(event.trackingNumber).toBe('JN123456789')
    expect(event.carrierId).toBe('janio')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Order created')
    expect(event.location?.city).toBe('Singapore')
    expect(event.location?.country).toBe('SG')
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
    expect(events[0].trackingNumber).toBe('JN123456789')
  })

  it('handles null location and country gracefully', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ location: null, country: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['CREATED', 'PRE_TRANSIT'],
      ['PICKED_UP', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['CUSTOMS', 'IN_TRANSIT'],
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
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.id).toBe('ord-abc-123')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('JN123456789')
    expect(result.carrierId).toBe('janio')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.labelUrl).toContain('ord-abc-123.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Tan')
    expect(result.originAddress?.city).toBe('Singapore')
    expect(result.destinationAddress?.name).toBe('Bob Nguyen')
    expect(result.destinationAddress?.city).toBe('Ho Chi Minh City')
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
      ['CREATED', 'PENDING'],
      ['PICKED_UP', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['CUSTOMS', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED', 'EXCEPTION'],
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
