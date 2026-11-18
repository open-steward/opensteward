import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type PostiTrackingResponse,
  type PostiTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/posti/transform/tracking'
import {
  transformShipment,
  type PostiShipment,
} from '../../../../../src/verticals/logistics/adapters/posti/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<PostiTrackingEvent> = {}): PostiTrackingEvent {
  return {
    event_code: 'IN_TRANSPORT',
    description: 'Lähetys kuljetuksessa',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Helsinki',
    postal_code: '00100',
    country: 'FI',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<PostiTrackingResponse> = {}): PostiTrackingResponse {
  return {
    tracking_code: 'FI123456789',
    status: 'IN_TRANSPORT',
    events: [
      makeTrackingEvent({ event_code: 'REGISTERED', description: 'Lähetys rekisteröity', location: 'Turku' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<PostiShipment> = {}): PostiShipment {
  return {
    shipment_id: 'shp-posti-001',
    tracking_code: 'FI123456789',
    status: 'REGISTERED',
    service_code: 'PARCEL_STANDARD',
    weight: 3.0,
    weight_unit: 'kg',
    sender: {
      name: 'Alice Virtanen',
      street1: 'Mannerheimintie 10',
      city: 'Helsinki',
      postal_code: '00100',
      country: 'FI',
    },
    recipient: {
      name: 'Bob Korhonen',
      street1: 'Hämeenkatu 5',
      city: 'Tampere',
      postal_code: '33100',
      country: 'FI',
    },
    label_url: 'https://api.posti.fi/labels/shp-posti-001.pdf',
    reference: 'REF-POSTI-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Posti transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('FI123456789')
    expect(event.carrierId).toBe('posti')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Lähetys rekisteröity')
    expect(event.location?.city).toBe('Turku')
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
    expect(events[0].trackingNumber).toBe('FI123456789')
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
      ['REGISTERED', 'PRE_TRANSIT'],
      ['IN_TRANSPORT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['DELIVERY_ATTEMPT', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['READY_FOR_PICKUP', 'AVAILABLE_FOR_PICKUP'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [eventCode, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ event_code: eventCode })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('Posti transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-posti-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('FI123456789')
    expect(result.carrierId).toBe('posti')
    expect(result.serviceCode).toBe('PARCEL_STANDARD')
    expect(result.reference).toBe('REF-POSTI-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Virtanen')
    expect(result.originAddress?.city).toBe('Helsinki')
    expect(result.destinationAddress?.name).toBe('Bob Korhonen')
    expect(result.destinationAddress?.city).toBe('Tampere')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(3.0)
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
      ['REGISTERED', 'PENDING'],
      ['IN_TRANSPORT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['DELIVERY_ATTEMPT', 'EXCEPTION'],
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
