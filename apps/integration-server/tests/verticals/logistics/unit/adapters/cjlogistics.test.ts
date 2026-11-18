import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type CjLogisticsTrackingResponse,
  type CjLogisticsTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/cjlogistics/transform/tracking'
import {
  transformShipment,
  type CjLogisticsShipment,
} from '../../../../../src/verticals/logistics/adapters/cjlogistics/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<CjLogisticsTrackingEvent> = {}): CjLogisticsTrackingEvent {
  return {
    status_code: 'IN_TRANSIT',
    status_description: 'Package in transit to destination',
    timestamp: '2024-08-12T09:00:00Z',
    location: 'Seoul Hub',
    branch: 'SEL-01',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<CjLogisticsTrackingResponse> = {}): CjLogisticsTrackingResponse {
  return {
    invoice_number: 'CJ123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status_code: 'RECEIVED', status_description: 'Package received', location: 'Busan' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<CjLogisticsShipment> = {}): CjLogisticsShipment {
  return {
    shipment_id: 'shp-cj-001',
    invoice_number: 'CJ123456789',
    status: 'RECEIVED',
    label_url: 'https://api.cjlogistics.com/labels/shp-cj-001.pdf',
    service_code: 'STANDARD',
    weight: 3.5,
    weight_unit: 'kg',
    sender: {
      name: 'Kim Min-jun',
      address_line1: '123 Gangnam-daero',
      city: 'Seoul',
      postal_code: '06130',
      country: 'KR',
    },
    recipient: {
      name: 'Park Ji-yeon',
      address_line1: '456 Haeundae-ro',
      city: 'Busan',
      postal_code: '48099',
      country: 'KR',
    },
    created_at: '2024-08-12T07:00:00Z',
    updated_at: '2024-08-12T09:00:00Z',
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

    expect(event.trackingNumber).toBe('CJ123456789')
    expect(event.carrierId).toBe('cjlogistics')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Package received')
    expect(event.location?.city).toBe('Busan')
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
    expect(events[0].trackingNumber).toBe('CJ123456789')
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
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED', 'FAILURE'],
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

    expect(result.id).toBe('shp-cj-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('CJ123456789')
    expect(result.carrierId).toBe('cjlogistics')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.labelUrl).toContain('shp-cj-001.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Kim Min-jun')
    expect(result.originAddress?.city).toBe('Seoul')
    expect(result.destinationAddress?.name).toBe('Park Ji-yeon')
    expect(result.destinationAddress?.city).toBe('Busan')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(3.5)
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
      ['RECEIVED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED', 'EXCEPTION'],
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
