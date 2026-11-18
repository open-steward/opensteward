import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type YamatoTrackingResponse,
  type YamatoTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/yamato/transform/tracking'
import {
  transformShipment,
  type YamatoShipment,
} from '../../../../../src/verticals/logistics/adapters/yamato/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<YamatoTrackingEvent> = {}): YamatoTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Package in transit',
    timestamp: '2024-09-01T06:00:00Z',
    location: 'Tokyo Sorting Center',
    office: 'TKY-01',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<YamatoTrackingResponse> = {}): YamatoTrackingResponse {
  return {
    tracking_number: '1234-5678-9012',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'ACCEPTED', description: 'Shipment accepted', location: 'Osaka' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<YamatoShipment> = {}): YamatoShipment {
  return {
    shipment_id: 'shp-ym-001',
    tracking_number: '1234-5678-9012',
    status: 'ACCEPTED',
    service_code: 'TAKKYUBIN',
    label_url: 'https://api.kuronekoyamato.co.jp/labels/shp-ym-001.pdf',
    weight: 5.0,
    weight_unit: 'kg',
    sender: {
      name: 'Tanaka Taro',
      address_line1: '1-1-1 Nishi-Shinjuku',
      city: 'Tokyo',
      state: 'Tokyo',
      postal_code: '160-0023',
      country: 'JP',
    },
    recipient: {
      name: 'Suzuki Hanako',
      address_line1: '2-2-2 Umeda',
      city: 'Osaka',
      state: 'Osaka',
      postal_code: '530-0001',
      country: 'JP',
    },
    reference: 'JP-ORDER-001',
    created_at: '2024-09-01T05:00:00Z',
    updated_at: '2024-09-01T06:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]

    expect(event.trackingNumber).toBe('1234-5678-9012')
    expect(event.carrierId).toBe('yamato')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment accepted')
    expect(event.location?.city).toBe('Osaka')
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
      ['ACCEPTED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['DELIVERING', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['HELD', 'FAILURE'],
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

    expect(result.id).toBe('shp-ym-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('1234-5678-9012')
    expect(result.carrierId).toBe('yamato')
    expect(result.serviceCode).toBe('TAKKYUBIN')
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Tanaka Taro')
    expect(result.destinationAddress?.name).toBe('Suzuki Hanako')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(5.0)
    expect(result.totalWeight?.unit).toBe('kg')
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
      ['ACCEPTED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['DELIVERING', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['HELD', 'EXCEPTION'],
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
