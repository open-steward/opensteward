import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type FetchrTracking,
  type FetchrTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/fetchr/transform/tracking'
import {
  transformShipment,
  type FetchrShipment,
} from '../../../../../src/verticals/logistics/adapters/fetchr/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<FetchrTrackingEvent> = {}): FetchrTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Package in transit to destination',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Dubai Hub',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<FetchrTracking> = {}): FetchrTracking {
  return {
    trackingId: 'FTR123456789',
    currentStatus: 'IN_TRANSIT',
    events: [
      makeEvent({ status: 'CREATED', description: 'Order created', location: 'Dubai' }),
      makeEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<FetchrShipment> = {}): FetchrShipment {
  return {
    orderId: 'ORD-FTR-001',
    trackingId: 'FTR123456789',
    status: 'CREATED',
    label_url: 'https://api.fetchr.us/labels/FTR123456789.pdf',
    service_code: 'SAME_DAY',
    weight: 2.5,
    weight_unit: 'kg',
    sender: {
      name: 'Ahmed Khalil',
      address_line1: '45 Al Wasl Road',
      city: 'Dubai',
      postal_code: '00000',
      country: 'AE',
    },
    recipient: {
      name: 'Fatima Hassan',
      address_line1: '12 Corniche Road',
      city: 'Abu Dhabi',
      postal_code: '00000',
      country: 'AE',
    },
    reference: 'FTR-REF-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Fetchr transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'FTR123456789')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw, 'FTR123456789')[0]

    expect(event.trackingNumber).toBe('FTR123456789')
    expect(event.carrierId).toBe('fetchr')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Order created')
    expect(event.location?.city).toBe('Dubai')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'FTR123456789')
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTracking({ events: [] })
    const events = transformTracking(raw, 'FTR123456789')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('FTR123456789')
  })

  it('handles null location gracefully', () => {
    const raw = makeTracking({
      events: [makeEvent({ location: null })],
    })
    const event = transformTracking(raw, 'FTR123456789')[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['CREATED', 'PRE_TRANSIT'],
      ['PICKED_UP', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['ON_HOLD', 'UNKNOWN'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTracking({
        events: [makeEvent({ status })],
      })
      expect(transformTracking(raw, 'FTR123456789')[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('Fetchr transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('ORD-FTR-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('FTR123456789')
    expect(result.carrierId).toBe('fetchr')
    expect(result.serviceCode).toBe('SAME_DAY')
    expect(result.labelUrl).toContain('FTR123456789.pdf')
    expect(result.reference).toBe('FTR-REF-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Ahmed Khalil')
    expect(result.originAddress?.city).toBe('Dubai')
    expect(result.destinationAddress?.name).toBe('Fatima Hassan')
    expect(result.destinationAddress?.city).toBe('Abu Dhabi')
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
      reference: null,
      trackingId: null,
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
    expect(result.trackingNumber).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['CREATED', 'PENDING'],
      ['PICKED_UP', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED', 'EXCEPTION'],
      ['RETURNED', 'RETURNED'],
      ['CANCELLED', 'CANCELLED'],
      ['ON_HOLD', 'EXCEPTION'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipment({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
