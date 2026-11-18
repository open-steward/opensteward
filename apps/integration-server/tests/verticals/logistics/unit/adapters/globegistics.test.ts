import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type GlobegisticsTrackingResponse,
  type GlobegisticsTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/globegistics/transform/tracking'
import {
  transformShipment,
  type GlobegisticsShipment,
} from '../../../../../src/verticals/logistics/adapters/globegistics/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<GlobegisticsTrackingEvent> = {}): GlobegisticsTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'JFK Airport',
    country: 'US',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<GlobegisticsTrackingResponse> = {}): GlobegisticsTrackingResponse {
  return {
    tracking_number: 'GG123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'RECEIVED', description: 'Package received', location: 'New York', country: 'US' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<GlobegisticsShipment> = {}): GlobegisticsShipment {
  return {
    shipment_id: 'shp-gg-001',
    tracking_number: 'GG123456789',
    status: 'RECEIVED',
    service_code: 'INTL_STANDARD',
    weight: 8.0,
    weight_unit: 'oz',
    sender: {
      name: 'Alice Sender',
      address_line1: '123 Main St',
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      country: 'US',
    },
    recipient: {
      name: 'Bob Receiver',
      address_line1: '10 Rue de la Paix',
      city: 'Paris',
      postal_code: '75002',
      country: 'FR',
    },
    destination_country: 'FR',
    reference: 'ORDER-INTL-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Globegistics transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('GG123456789')
    expect(event.carrierId).toBe('globegistics')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Package received')
    expect(event.location?.city).toBe('New York')
    expect(event.location?.country).toBe('US')
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
    expect(events[0].trackingNumber).toBe('GG123456789')
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
      ['RECEIVED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['CUSTOMS', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['EXCEPTION', 'FAILURE'],
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

describe('Globegistics transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-gg-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('GG123456789')
    expect(result.carrierId).toBe('globegistics')
    expect(result.serviceCode).toBe('INTL_STANDARD')
    expect(result.reference).toBe('ORDER-INTL-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('New York')
    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.city).toBe('Paris')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(8.0)
    expect(result.totalWeight?.unit).toBe('oz')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      weight: null,
      weight_unit: null,
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
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['RECEIVED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['CUSTOMS', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURNED'],
      ['EXCEPTION', 'EXCEPTION'],
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
