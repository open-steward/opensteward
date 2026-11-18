import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type YodelTrackingResponse,
  type YodelTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/yodel/transform/tracking'
import {
  transformShipment,
  type YodelParcel,
} from '../../../../../src/verticals/logistics/adapters/yodel/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<YodelTrackingEvent> = {}): YodelTrackingEvent {
  return {
    event_code: 'IN_NETWORK',
    description: 'Parcel processed at hub',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Leeds Hub',
    depot: 'LDS-01',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<YodelTrackingResponse> = {}): YodelTrackingResponse {
  return {
    tracking_number: 'YDL123456789',
    status: 'IN_NETWORK',
    events: [
      makeTrackingEvent({ event_code: 'COLLECTED', description: 'Parcel collected from sender', location: 'London' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeParcel(overrides: Partial<YodelParcel> = {}): YodelParcel {
  return {
    parcel_id: 'prcl-ydl-001',
    tracking_number: 'YDL123456789',
    status: 'COLLECTED',
    label_url: 'https://api.yodel.co.uk/labels/prcl-ydl-001.pdf',
    service_code: 'NEXT_DAY',
    weight: 2.0,
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
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Yodel transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('YDL123456789')
    expect(event.carrierId).toBe('yodel')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Parcel collected from sender')
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
    expect(events[0].trackingNumber).toBe('YDL123456789')
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
      ['IN_NETWORK', 'IN_TRANSIT'],
      ['WITH_DRIVER', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['CARDED', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
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

describe('Yodel transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeParcel()
    const result = transformShipment(raw)

    expect(result.id).toBe('prcl-ydl-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('YDL123456789')
    expect(result.carrierId).toBe('yodel')
    expect(result.serviceCode).toBe('NEXT_DAY')
    expect(result.labelUrl).toContain('prcl-ydl-001.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeParcel()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Smith')
    expect(result.originAddress?.city).toBe('London')
    expect(result.destinationAddress?.name).toBe('Bob Jones')
    expect(result.destinationAddress?.city).toBe('Edinburgh')
  })

  it('maps weight', () => {
    const raw = makeParcel()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(2.0)
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
      ['IN_NETWORK', 'IN_TRANSIT'],
      ['WITH_DRIVER', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['CARDED', 'EXCEPTION'],
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
