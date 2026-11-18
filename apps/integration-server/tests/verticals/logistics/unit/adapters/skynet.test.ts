import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type SkynetTracking,
  type SkynetTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/skynet/transform/tracking'
import {
  transformShipment,
  type SkynetShipment,
} from '../../../../../src/verticals/logistics/adapters/skynet/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<SkynetTrackingEvent> = {}): SkynetTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Shipment in transit to destination',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Nairobi Hub',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<SkynetTracking> = {}): SkynetTracking {
  return {
    waybillNumber: 'SKY123456789',
    currentStatus: 'IN_TRANSIT',
    events: [
      makeEvent({ status: 'BOOKED', description: 'Shipment booked', location: 'Lagos' }),
      makeEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<SkynetShipment> = {}): SkynetShipment {
  return {
    waybillNumber: 'SKY123456789',
    status: 'BOOKED',
    label_url: 'https://api.skynetwwe.com/labels/SKY123456789.pdf',
    service_code: 'EXPRESS',
    weight: 3.5,
    weight_unit: 'kg',
    sender: {
      name: 'John Okafor',
      address_line1: '45 Marina Road',
      city: 'Lagos',
      postal_code: '100001',
      country: 'NG',
    },
    recipient: {
      name: 'Amina Hassan',
      address_line1: '12 Kenyatta Avenue',
      city: 'Nairobi',
      postal_code: '00100',
      country: 'KE',
    },
    reference: 'SKY-REF-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'SKY123456789')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw, 'SKY123456789')[0]

    expect(event.trackingNumber).toBe('SKY123456789')
    expect(event.carrierId).toBe('skynet')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment booked')
    expect(event.location?.city).toBe('Lagos')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'SKY123456789')
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTracking({ events: [] })
    const events = transformTracking(raw, 'SKY123456789')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('SKY123456789')
  })

  it('handles null location gracefully', () => {
    const raw = makeTracking({
      events: [makeEvent({ location: null })],
    })
    const event = transformTracking(raw, 'SKY123456789')[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['BOOKED', 'PRE_TRANSIT'],
      ['COLLECTED', 'PRE_TRANSIT'],
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
      expect(transformTracking(raw, 'SKY123456789')[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('SKY123456789')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('SKY123456789')
    expect(result.carrierId).toBe('skynet')
    expect(result.serviceCode).toBe('EXPRESS')
    expect(result.labelUrl).toContain('SKY123456789.pdf')
    expect(result.reference).toBe('SKY-REF-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('John Okafor')
    expect(result.originAddress?.city).toBe('Lagos')
    expect(result.destinationAddress?.name).toBe('Amina Hassan')
    expect(result.destinationAddress?.city).toBe('Nairobi')
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
      ['BOOKED', 'PENDING'],
      ['COLLECTED', 'PENDING'],
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
