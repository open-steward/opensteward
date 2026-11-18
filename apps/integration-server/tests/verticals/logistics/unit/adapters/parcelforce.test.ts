import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ParcelforceTrackingResponse,
  type ParcelforceTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/parcelforce/transform/tracking'
import {
  transformShipment,
  type ParcelforceShipment,
} from '../../../../../src/verticals/logistics/adapters/parcelforce/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<ParcelforceTrackingEvent> = {}): ParcelforceTrackingEvent {
  return {
    status_code: 'IN_TRANSIT',
    description: 'Parcel in transit to depot',
    timestamp: '2024-06-10T08:30:00Z',
    location: 'Birmingham Hub',
    depot: 'BHM-02',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<ParcelforceTrackingResponse> = {}): ParcelforceTrackingResponse {
  return {
    tracking_number: 'PF123456789GB',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status_code: 'COLLECTED', description: 'Parcel collected', location: 'London' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ParcelforceShipment> = {}): ParcelforceShipment {
  return {
    shipment_id: 'shp-pf-001',
    tracking_number: 'PF123456789GB',
    status: 'COLLECTED',
    service_code: 'EXPRESS24',
    label_url: 'https://api.parcelforce.net/labels/shp-pf-001.pdf',
    weight: 2.5,
    weight_unit: 'kg',
    sender: {
      name: 'Alice Smith',
      address_line1: '10 Downing St',
      city: 'London',
      postal_code: 'SW1A 2AA',
      country: 'GB',
    },
    recipient: {
      name: 'Bob Jones',
      address_line1: '1 Royal Mile',
      city: 'Edinburgh',
      postal_code: 'EH1 1YZ',
      country: 'GB',
    },
    reference: 'ORDER-001',
    created_at: '2024-06-10T07:00:00Z',
    updated_at: '2024-06-10T08:30:00Z',
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

    expect(event.trackingNumber).toBe('PF123456789GB')
    expect(event.carrierId).toBe('parcelforce')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Parcel collected')
    expect(event.location?.city).toBe('London')
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
    expect(events[0].trackingNumber).toBe('PF123456789GB')
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
      ['COLLECTED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['CARDED', 'FAILURE'],
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

    expect(result.id).toBe('shp-pf-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('PF123456789GB')
    expect(result.carrierId).toBe('parcelforce')
    expect(result.serviceCode).toBe('EXPRESS24')
    expect(result.labelUrl).toContain('shp-pf-001.pdf')
    expect(result.reference).toBe('ORDER-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Smith')
    expect(result.originAddress?.city).toBe('London')
    expect(result.destinationAddress?.name).toBe('Bob Jones')
    expect(result.destinationAddress?.city).toBe('Edinburgh')
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
      tracking_number: null,
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
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['COLLECTED', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['CARDED', 'EXCEPTION'],
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
