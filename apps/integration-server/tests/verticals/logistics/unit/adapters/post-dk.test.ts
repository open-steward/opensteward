import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type PostDkTrackingResponse,
  type PostDkTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/post-dk/transform/tracking'
import {
  transformShipment,
  type PostDkShipment,
} from '../../../../../src/verticals/logistics/adapters/post-dk/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<PostDkTrackingEvent> = {}): PostDkTrackingEvent {
  return {
    eventCode: 'IN_TRANSIT',
    eventDescription: 'Shipment in transit',
    eventTime: '2024-03-15T10:30:00Z',
    location: 'Copenhagen',
    country: 'DK',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<PostDkTrackingResponse> = {}): PostDkTrackingResponse {
  return {
    shipmentId: 'DK123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ eventCode: 'HANDED_IN', eventDescription: 'Shipment handed in', location: 'Aarhus' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<PostDkShipment> = {}): PostDkShipment {
  return {
    shipment_id: 'shp-dk-001',
    tracking_number: 'DK123456789',
    status: 'HANDED_IN',
    service_code: 'MYPACK_HOME',
    weight: 2.5,
    weight_unit: 'kg',
    sender: {
      name: 'Alice Jensen',
      street1: 'Stroeget 10',
      city: 'Copenhagen',
      postal_code: '1000',
      country: 'DK',
    },
    recipient: {
      name: 'Bob Nielsen',
      street1: 'Boulevarden 5',
      city: 'Aarhus',
      postal_code: '8000',
      country: 'DK',
    },
    label_url: 'https://api.postnord.com/labels/shp-dk-001.pdf',
    reference: 'REF-DK-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('PostDk transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('DK123456789')
    expect(event.carrierId).toBe('post-dk')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment handed in')
    expect(event.location?.city).toBe('Aarhus')
    expect(event.location?.country).toBe('DK')
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
    expect(events[0].trackingNumber).toBe('DK123456789')
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
      ['HANDED_IN', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['ATTEMPTED', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['READY_FOR_PICKUP', 'AVAILABLE_FOR_PICKUP'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [eventCode, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ eventCode })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('PostDk transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-dk-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('DK123456789')
    expect(result.carrierId).toBe('post-dk')
    expect(result.serviceCode).toBe('MYPACK_HOME')
    expect(result.reference).toBe('REF-DK-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Jensen')
    expect(result.originAddress?.city).toBe('Copenhagen')
    expect(result.destinationAddress?.name).toBe('Bob Nielsen')
    expect(result.destinationAddress?.city).toBe('Aarhus')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(2.5)
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
      reference: null,
      created_at: null,
      updated_at: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['HANDED_IN', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['ATTEMPTED', 'EXCEPTION'],
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
