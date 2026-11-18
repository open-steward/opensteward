import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type GhnTrackingResponse,
  type GhnTrackingEventRaw,
} from '../../../../../src/verticals/logistics/adapters/ghn/transform/tracking'
import {
  transformShipment,
  type GhnShipmentRaw,
} from '../../../../../src/verticals/logistics/adapters/ghn/transform/shipment'

function makeEvent(overrides: Partial<GhnTrackingEventRaw> = {}): GhnTrackingEventRaw {
  return {
    status: 'IN_TRANSIT',
    description: 'In transit',
    timestamp: '2024-03-15T10:30:00Z',
    city: 'Test City',
    country: 'US',
    postal_code: '00000',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<GhnTrackingResponse> = {}): GhnTrackingResponse {
  return {
    tracking_number: 'TRK123',
    shipment_id: 'SHP1',
    status: 'IN_TRANSIT',
    events: [makeEvent({ status: 'CREATED', description: 'Label created' }), makeEvent()],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<GhnShipmentRaw> = {}): GhnShipmentRaw {
  return {
    id: 'shp-001',
    tracking_number: 'TRK123',
    status: 'IN_TRANSIT',
    service_code: 'STANDARD',
    weight: 2.5,
    weight_unit: 'kg',
    sender: { name: 'Alice', street1: '1 A St', city: 'A City', postal_code: '11111', country: 'US' },
    recipient: { name: 'Bob', street1: '2 B St', city: 'B City', postal_code: '22222', country: 'GB' },
    label_url: 'https://example.com/label.pdf',
    reference: 'REF-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('GhnAdapter transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps fields to canonical event', () => {
    const e = transformTracking(makeTrackingResponse())[0]
    expect(e.trackingNumber).toBe('TRK123')
    expect(e.carrierId).toBe('ghn')
    expect(e.status).toBe('PRE_TRANSIT')
    expect(e.description).toBe('Label created')
    expect(e.location?.city).toBe('Test City')
    expect(e.location?.country).toBe('US')
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a fallback event when events is empty', () => {
    const r = transformTracking(makeTrackingResponse({ events: [], status: 'CREATED' }))
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('PRE_TRANSIT')
  })

  it('handles missing location gracefully', () => {
    const e = transformTracking(makeTrackingResponse({
      events: [makeEvent({ city: null, country: null, postal_code: null, location: null })],
    }))[0]
    expect(e.location).toBeUndefined()
  })

  it('maps statuses correctly', () => {
    const cases: Array<[string, string]> = [
      ['DELIVERED', 'DELIVERED'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['CREATED', 'PRE_TRANSIT'],
      ['EXCEPTION', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['AVAILABLE_FOR_PICKUP', 'AVAILABLE_FOR_PICKUP'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [s, expected] of cases) {
      const e = transformTracking(makeTrackingResponse({ events: [makeEvent({ status: s })] }))[0]
      expect(e.status).toBe(expected)
    }
  })
})

describe('GhnAdapter transformShipment', () => {
  it('maps canonical fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.id).toBe('shp-001')
    expect(r.status).toBe('IN_TRANSIT')
    expect(r.trackingNumber).toBe('TRK123')
    expect(r.carrierId).toBe('ghn')
    expect(r.serviceCode).toBe('STANDARD')
    expect(r.reference).toBe('REF-001')
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const r = transformShipment(makeShipment())
    expect(r.originAddress?.name).toBe('Alice')
    expect(r.destinationAddress?.name).toBe('Bob')
  })

  it('maps weight', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(2.5)
    expect(r.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields', () => {
    const r = transformShipment(makeShipment({
      weight: null, weight_unit: null, label_url: null, sender: null, recipient: null,
      service_code: null, status: null, reference: null, created_at: null, updated_at: null,
    }))
    expect(r.totalWeight).toBeUndefined()
    expect(r.labelUrl).toBeUndefined()
    expect(r.originAddress).toBeUndefined()
    expect(r.destinationAddress).toBeUndefined()
  })

  it('maps statuses correctly', () => {
    const cases: Array<[string | null, string]> = [
      ['DELIVERED', 'DELIVERED'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['CANCELLED', 'CANCELLED'],
      ['RETURNED', 'RETURNED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['CREATED', 'LABEL_CREATED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [s, expected] of cases) {
      expect(transformShipment(makeShipment({ status: s })).status).toBe(expected)
    }
  })
})
