import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type YtoExpressTrackingResponse,
  type YtoExpressTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/yto-express/transform/tracking'
import {
  transformShipment,
  type YtoExpressOrder,
} from '../../../../../src/verticals/logistics/adapters/yto-express/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<YtoExpressTrackingEvent> = {}): YtoExpressTrackingEvent {
  return {
    status: 'DEPARTURE',
    description: 'Departed from sorting centre',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Shanghai Sorting Centre',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<YtoExpressTrackingResponse> = {}): YtoExpressTrackingResponse {
  return {
    tracking_number: 'YT123456789',
    status: 'DEPARTURE',
    events: [
      makeTrackingEvent({ status: 'GOT', description: 'Parcel collected', location: 'Shanghai' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeOrder(overrides: Partial<YtoExpressOrder> = {}): YtoExpressOrder {
  return {
    order_id: 'ord-abc-123',
    tracking_number: 'YT123456789',
    status: 'GOT',
    label_url: 'https://open.yto.net.cn/labels/ord-abc-123.pdf',
    service_code: 'STANDARD',
    weight: 2.5,
    weight_unit: 'kg',
    sender: {
      name: 'Zhang Wei',
      address_line1: '100 Nanjing Road',
      city: 'Shanghai',
      postal_code: '200001',
      country: 'CN',
    },
    recipient: {
      name: 'Li Na',
      address_line1: '50 Wangfujing',
      city: 'Beijing',
      postal_code: '100006',
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

    expect(event.trackingNumber).toBe('YT123456789')
    expect(event.carrierId).toBe('yto-express')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Parcel collected')
    expect(event.location?.city).toBe('Shanghai')
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
    expect(events[0].trackingNumber).toBe('YT123456789')
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
      ['GOT', 'PRE_TRANSIT'],
      ['DEPARTURE', 'IN_TRANSIT'],
      ['ARRIVAL', 'IN_TRANSIT'],
      ['DELIVERING', 'OUT_FOR_DELIVERY'],
      ['SIGNED', 'DELIVERED'],
      ['PROBLEM', 'FAILURE'],
      ['RETURN', 'RETURN_TO_SENDER'],
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
    expect(result.trackingNumber).toBe('YT123456789')
    expect(result.carrierId).toBe('yto-express')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.labelUrl).toContain('ord-abc-123.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Zhang Wei')
    expect(result.originAddress?.city).toBe('Shanghai')
    expect(result.destinationAddress?.name).toBe('Li Na')
    expect(result.destinationAddress?.city).toBe('Beijing')
  })

  it('maps weight', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(2.5)
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
      ['GOT', 'PENDING'],
      ['DEPARTURE', 'IN_TRANSIT'],
      ['ARRIVAL', 'IN_TRANSIT'],
      ['DELIVERING', 'OUT_FOR_DELIVERY'],
      ['SIGNED', 'DELIVERED'],
      ['PROBLEM', 'EXCEPTION'],
      ['RETURN', 'RETURNED'],
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
