import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type OmnivaTrackingResponse,
  type OmnivaTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/omniva/transform/tracking'
import {
  transformShipment,
  type OmnivaParcel,
} from '../../../../../src/verticals/logistics/adapters/omniva/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<OmnivaTrackingEvent> = {}): OmnivaTrackingEvent {
  return {
    event_code: 'IN_TRANSIT',
    description: 'Parcel in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Tallinn',
    country: 'EE',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<OmnivaTrackingResponse> = {}): OmnivaTrackingResponse {
  return {
    barcode: 'EE123456789',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ event_code: 'REGISTERED', description: 'Parcel registered', location: 'Tartu' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeParcel(overrides: Partial<OmnivaParcel> = {}): OmnivaParcel {
  return {
    parcel_id: 'prcl-omn-001',
    barcode: 'EE123456789',
    status: 'REGISTERED',
    service_code: 'PARCEL_MACHINE',
    weight: 1.0,
    weight_unit: 'kg',
    sender: {
      name: 'Alice Tamm',
      street1: 'Viru 10',
      city: 'Tallinn',
      postal_code: '10140',
      country: 'EE',
    },
    recipient: {
      name: 'Bob Kask',
      street1: 'Riia 5',
      city: 'Tartu',
      postal_code: '51014',
      country: 'EE',
    },
    label_url: 'https://api.omniva.eu/labels/prcl-omn-001.pdf',
    reference: 'REF-OMN-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Omniva transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('EE123456789')
    expect(event.carrierId).toBe('omniva')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Parcel registered')
    expect(event.location?.city).toBe('Tartu')
    expect(event.location?.country).toBe('EE')
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
    expect(events[0].trackingNumber).toBe('EE123456789')
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
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['IN_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['IN_PARCEL_MACHINE', 'AVAILABLE_FOR_PICKUP'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['EXCEPTION', 'FAILURE'],
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

describe('Omniva transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeParcel()
    const result = transformShipment(raw)

    expect(result.id).toBe('prcl-omn-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('EE123456789')
    expect(result.carrierId).toBe('omniva')
    expect(result.serviceCode).toBe('PARCEL_MACHINE')
    expect(result.reference).toBe('REF-OMN-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeParcel()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Tamm')
    expect(result.originAddress?.city).toBe('Tallinn')
    expect(result.destinationAddress?.name).toBe('Bob Kask')
    expect(result.destinationAddress?.city).toBe('Tartu')
  })

  it('maps weight', () => {
    const raw = makeParcel()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(1.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeParcel()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeParcel({
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
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['IN_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['EXCEPTION', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeParcel({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
