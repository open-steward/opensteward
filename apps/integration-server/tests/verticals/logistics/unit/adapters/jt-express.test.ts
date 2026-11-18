import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type JtExpressTrackingResponse,
  type JtExpressTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/jt-express/transform/tracking'
import {
  transformShipment,
  type JtExpressOrder,
} from '../../../../../src/verticals/logistics/adapters/jt-express/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<JtExpressTrackingEvent> = {}): JtExpressTrackingEvent {
  return {
    status_code: 'INBOUND',
    status_description: 'Parcel arrived at sorting hub',
    timestamp: '2024-07-20T14:00:00Z',
    location: 'Kuala Lumpur Hub',
    hub: 'KUL-01',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<JtExpressTrackingResponse> = {}): JtExpressTrackingResponse {
  return {
    bill_code: 'JT123456789MY',
    status: 'INBOUND',
    events: [
      makeTrackingEvent({ status_code: 'PICKUP', status_description: 'Parcel picked up', location: 'Penang' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeOrder(overrides: Partial<JtExpressOrder> = {}): JtExpressOrder {
  return {
    order_id: 'ord-jt-001',
    bill_code: 'JT123456789MY',
    status: 'PICKUP',
    label_url: 'https://openapi.jtexpress.my/labels/ord-jt-001.pdf',
    service_code: 'EZ',
    weight: 1.2,
    weight_unit: 'kg',
    sender: {
      name: 'Ahmad Bin Ali',
      address_line1: '10 Jalan Bukit Bintang',
      city: 'Kuala Lumpur',
      postal_code: '55100',
      country: 'MY',
    },
    recipient: {
      name: 'Tan Wei Lin',
      address_line1: '25 Gurney Drive',
      city: 'Penang',
      postal_code: '10250',
      country: 'MY',
    },
    created_at: '2024-07-20T12:00:00Z',
    updated_at: '2024-07-20T14:00:00Z',
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

    expect(event.trackingNumber).toBe('JT123456789MY')
    expect(event.carrierId).toBe('jt-express')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Parcel picked up')
    expect(event.location?.city).toBe('Penang')
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
    expect(events[0].trackingNumber).toBe('JT123456789MY')
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
      ['PICKUP', 'PRE_TRANSIT'],
      ['INBOUND', 'IN_TRANSIT'],
      ['OUTBOUND', 'IN_TRANSIT'],
      ['DELIVERING', 'OUT_FOR_DELIVERY'],
      ['SIGNED', 'DELIVERED'],
      ['PROBLEMATIC', 'FAILURE'],
      ['RETURNING', 'RETURN_TO_SENDER'],
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
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.id).toBe('ord-jt-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('JT123456789MY')
    expect(result.carrierId).toBe('jt-express')
    expect(result.serviceCode).toBe('EZ')
    expect(result.labelUrl).toContain('ord-jt-001.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Ahmad Bin Ali')
    expect(result.originAddress?.city).toBe('Kuala Lumpur')
    expect(result.destinationAddress?.name).toBe('Tan Wei Lin')
    expect(result.destinationAddress?.city).toBe('Penang')
  })

  it('maps weight', () => {
    const raw = makeOrder()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(1.2)
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
      ['PICKUP', 'PENDING'],
      ['INBOUND', 'IN_TRANSIT'],
      ['OUTBOUND', 'IN_TRANSIT'],
      ['DELIVERING', 'OUT_FOR_DELIVERY'],
      ['SIGNED', 'DELIVERED'],
      ['PROBLEMATIC', 'EXCEPTION'],
      ['RETURNING', 'RETURNED'],
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
