import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type EvriTrackingResponse,
  type EvriTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/evri/transform/tracking'
import {
  transformShipment,
  type EvriParcel,
} from '../../../../../src/verticals/logistics/adapters/evri/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<EvriTrackingEvent> = {}): EvriTrackingEvent {
  return {
    event_code: 'hub_scan',
    event_description: 'Parcel processed at hub',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Birmingham Hub',
    depot: 'BHM-01',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<EvriTrackingResponse> = {}): EvriTrackingResponse {
  return {
    tracking_number: 'EVRI123456789',
    status: 'hub_scan',
    events: [
      makeTrackingEvent({ event_code: 'collected', event_description: 'Parcel collected from sender', location: 'London' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeParcel(overrides: Partial<EvriParcel> = {}): EvriParcel {
  return {
    parcel_id: 'prcl-abc-123',
    tracking_number: 'EVRI123456789',
    status: 'collected',
    label_url: 'https://api.evri.com/labels/prcl-abc-123.pdf',
    service_code: 'STANDARD',
    weight: 1.5,
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

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('EVRI123456789')
    expect(event.carrierId).toBe('evri')
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
    expect(events[0].trackingNumber).toBe('EVRI123456789')
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
      ['collected', 'PRE_TRANSIT'],
      ['hub_scan', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['attempted_delivery', 'FAILURE'],
      ['returned', 'RETURN_TO_SENDER'],
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

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeParcel()
    const result = transformShipment(raw)

    expect(result.id).toBe('prcl-abc-123')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('EVRI123456789')
    expect(result.carrierId).toBe('evri')
    expect(result.serviceCode).toBe('STANDARD')
    expect(result.labelUrl).toContain('prcl-abc-123.pdf')
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

    expect(result.totalWeight?.value).toBe(1.5)
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
      ['collected', 'PENDING'],
      ['hub_scan', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['attempted_delivery', 'EXCEPTION'],
      ['returned', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeParcel({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
