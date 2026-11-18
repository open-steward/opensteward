import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ApcOvernightTrackingResponse,
  type ApcOvernightTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/apc-overnight/transform/tracking'
import {
  transformShipment,
  type ApcOvernightShipment,
} from '../../../../../src/verticals/logistics/adapters/apc-overnight/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ApcOvernightTrackingEvent> = {}): ApcOvernightTrackingEvent {
  return {
    code: 'IN_TRANSIT',
    status: 'IN_TRANSIT',
    description: 'Item in transit',
    timestamp: '2024-05-10T10:30:00Z',
    location: {
      city: 'Paris',
      country: 'FR',
      postal_code: '75001',
    },
    ...overrides,
  }
}

function makeTracking(overrides: Partial<ApcOvernightTrackingResponse> = {}): ApcOvernightTrackingResponse {
  return {
    shipment_id: 'SHIP-1',
    tracking_number: 'TRK-1',
    status: 'IN_TRANSIT',
    events: [
      makeEvent({ code: 'CREATED', status: 'CREATED', description: 'Created' }),
      makeEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ApcOvernightShipment> = {}): ApcOvernightShipment {
  return {
    id: 'shp-001',
    tracking_number: 'TRK-1',
    status: 'IN_TRANSIT',
    service_code: 'STD',
    weight: 2.5,
    weight_unit: 'kg',
    sender: {
      name: 'Alice Sender',
      street1: '1 Origin St',
      city: 'Paris',
      postal_code: '75001',
      country: 'FR',
    },
    recipient: {
      name: 'Bob Recipient',
      street1: '2 Dest Ave',
      city: 'Lyon',
      postal_code: '69001',
      country: 'FR',
    },
    label_url: 'https://example.com/label.pdf',
    reference: 'REF-001',
    created_at: '2024-05-10T09:00:00Z',
    updated_at: '2024-05-10T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('APC Overnight transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTracking()
    expect(transformTracking(raw)).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTracking())[0]
    expect(event.shipmentId).toBe('SHIP-1')
    expect(event.trackingNumber).toBe('TRK-1')
    expect(event.carrierId).toBe('apc-overnight')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Created')
    expect(event.location?.city).toBe('Paris')
    expect(event.location?.country).toBe('FR')
    expect(event.location?.postalCode).toBe('75001')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    transformTracking(makeTracking()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const events = transformTracking(makeTracking({ events: [], status: 'CREATED' }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('PRE_TRANSIT')
  })

  it('handles null location gracefully', () => {
    const event = transformTracking(makeTracking({ events: [makeEvent({ location: null })] }))[0]
    expect(event.location).toBeUndefined()
  })

  it('maps event status codes correctly', () => {
    const cases: [string, string][] = [
      ['CREATED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const e = transformTracking(makeTracking({ events: [makeEvent({ code, status: null })] }))[0]
      expect(e.status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('APC Overnight transformShipment', () => {
  it('maps canonical fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.id).toBe('shp-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('TRK-1')
    expect(result.carrierId).toBe('apc-overnight')
    expect(result.serviceCode).toBe('STD')
    expect(result.reference).toBe('REF-001')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('Paris')
    expect(result.destinationAddress?.name).toBe('Bob Recipient')
    expect(result.destinationAddress?.city).toBe('Lyon')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformShipment(makeShipment({
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
    }))
    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
    expect(result.status).toBe('UNKNOWN')
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['CREATED', 'LABEL_CREATED'],
      ['LABEL_CREATED', 'LABEL_CREATED'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'EXCEPTION'],
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
