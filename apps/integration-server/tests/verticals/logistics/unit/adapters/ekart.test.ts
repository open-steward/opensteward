import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type EkartTrackingResponse,
  type EkartTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/ekart/transform/tracking'
import {
  transformShipment,
  type EkartShipment,
} from '../../../../../src/verticals/logistics/adapters/ekart/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<EkartTrackingEvent> = {}): EkartTrackingEvent {
  return {
    status_code: 'DISPATCHED',
    status_description: 'Shipment dispatched from origin hub',
    timestamp: '2024-09-05T11:00:00Z',
    location: 'Mumbai Hub',
    hub: 'MUM-01',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<EkartTrackingResponse> = {}): EkartTrackingResponse {
  return {
    awb: 'EK123456789IN',
    status: 'DISPATCHED',
    events: [
      makeTrackingEvent({ status_code: 'CREATED', status_description: 'Shipment created', location: 'Bangalore' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<EkartShipment> = {}): EkartShipment {
  return {
    shipment_id: 'shp-ek-001',
    awb: 'EK123456789IN',
    status: 'CREATED',
    label_url: 'https://api.ekartlogistics.com/labels/shp-ek-001.pdf',
    service_code: 'STANDARD',
    weight: 0.8,
    weight_unit: 'kg',
    sender: {
      name: 'Priya Sharma',
      address_line1: '42 MG Road',
      city: 'Bangalore',
      state: 'Karnataka',
      postal_code: '560001',
      country: 'IN',
    },
    recipient: {
      name: 'Rahul Patel',
      address_line1: '15 Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      postal_code: '400002',
      country: 'IN',
    },
    created_at: '2024-09-05T09:00:00Z',
    updated_at: '2024-09-05T11:00:00Z',
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

    expect(event.trackingNumber).toBe('EK123456789IN')
    expect(event.carrierId).toBe('ekart')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment created')
    expect(event.location?.city).toBe('Bangalore')
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
    expect(events[0].trackingNumber).toBe('EK123456789IN')
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
      ['CREATED', 'PRE_TRANSIT'],
      ['DISPATCHED', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['NOT_DELIVERED', 'FAILURE'],
      ['RTO', 'RETURN_TO_SENDER'],
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

    expect(result.id).toBe('shp-ek-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('EK123456789IN')
    expect(result.carrierId).toBe('ekart')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.labelUrl).toContain('shp-ek-001.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Priya Sharma')
    expect(result.originAddress?.city).toBe('Bangalore')
    expect(result.destinationAddress?.name).toBe('Rahul Patel')
    expect(result.destinationAddress?.city).toBe('Mumbai')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(0.8)
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
      ['CREATED', 'PENDING'],
      ['DISPATCHED', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['NOT_DELIVERED', 'EXCEPTION'],
      ['RTO', 'RETURNED'],
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
