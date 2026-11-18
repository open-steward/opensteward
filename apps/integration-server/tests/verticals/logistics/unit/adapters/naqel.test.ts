import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type NaqelTracking,
  type NaqelTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/naqel/transform/tracking'
import {
  transformShipment,
  type NaqelShipment,
} from '../../../../../src/verticals/logistics/adapters/naqel/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<NaqelTrackingEvent> = {}): NaqelTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Shipment in transit to destination',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Riyadh Hub',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<NaqelTracking> = {}): NaqelTracking {
  return {
    waybillNumber: 'NQL123456789',
    currentStatus: 'IN_TRANSIT',
    events: [
      makeEvent({ status: 'BOOKED', description: 'Shipment booked', location: 'Dammam' }),
      makeEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<NaqelShipment> = {}): NaqelShipment {
  return {
    waybillNumber: 'NQL123456789',
    status: 'BOOKED',
    label_url: 'https://api.naqelexpress.com/labels/NQL123456789.pdf',
    service_code: 'NEXT_DAY',
    weight: 5.0,
    weight_unit: 'kg',
    sender: {
      name: 'Faisal Al-Saud',
      address_line1: '789 Olaya Street',
      city: 'Riyadh',
      postal_code: '11543',
      country: 'SA',
    },
    recipient: {
      name: 'Khalid Ibrahim',
      address_line1: '321 Dhahran Boulevard',
      city: 'Dammam',
      postal_code: '31411',
      country: 'SA',
    },
    reference: 'NQL-REF-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'NQL123456789')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw, 'NQL123456789')[0]

    expect(event.trackingNumber).toBe('NQL123456789')
    expect(event.carrierId).toBe('naqel')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Shipment booked')
    expect(event.location?.city).toBe('Dammam')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'NQL123456789')
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTracking({ events: [] })
    const events = transformTracking(raw, 'NQL123456789')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('NQL123456789')
  })

  it('handles null location gracefully', () => {
    const raw = makeTracking({
      events: [makeEvent({ location: null })],
    })
    const event = transformTracking(raw, 'NQL123456789')[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['BOOKED', 'PRE_TRANSIT'],
      ['PICKED_UP', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED_ATTEMPT', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTracking({
        events: [makeEvent({ status })],
      })
      expect(transformTracking(raw, 'NQL123456789')[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('NQL123456789')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('NQL123456789')
    expect(result.carrierId).toBe('naqel')
    expect(result.serviceCode).toBe('NEXT_DAY')
    expect(result.labelUrl).toContain('NQL123456789.pdf')
    expect(result.reference).toBe('NQL-REF-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Faisal Al-Saud')
    expect(result.originAddress?.city).toBe('Riyadh')
    expect(result.destinationAddress?.name).toBe('Khalid Ibrahim')
    expect(result.destinationAddress?.city).toBe('Dammam')
  })

  it('maps weight', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(5.0)
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
      ['PICKED_UP', 'PENDING'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['FAILED_ATTEMPT', 'EXCEPTION'],
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
