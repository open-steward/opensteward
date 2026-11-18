import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type BrtTrackingResponse,
  type BrtTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/brt/transform/tracking'
import {
  transformShipment,
  type BrtShipment,
} from '../../../../../src/verticals/logistics/adapters/brt/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<BrtTrackingEvent> = {}): BrtTrackingEvent {
  return {
    stato: 'IN_TRANSITO',
    descrizione: 'Spedizione in transito',
    data: '2024-03-15T10:30:00Z',
    filiale: 'Milano',
    localita: 'Milano Hub',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<BrtTrackingResponse> = {}): BrtTrackingResponse {
  return {
    shipment_id: 'BRT123456789',
    status: 'IN_TRANSITO',
    eventi: [
      makeTrackingEvent({ stato: 'RITIRATO', descrizione: 'Spedizione ritirata', localita: 'Roma' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<BrtShipment> = {}): BrtShipment {
  return {
    shipment_id: 'shp-brt-001',
    tracking_number: 'BRT123456789',
    status: 'RITIRATO',
    service_code: 'EXPRESS',
    weight: 5.0,
    weight_unit: 'kg',
    sender: {
      name: 'Alice Rossi',
      street1: 'Via Roma 10',
      city: 'Roma',
      postal_code: '00100',
      country: 'IT',
    },
    recipient: {
      name: 'Bob Bianchi',
      street1: 'Via Milano 5',
      city: 'Milano',
      postal_code: '20100',
      country: 'IT',
    },
    label_url: 'https://api.brt.it/labels/shp-brt-001.pdf',
    reference: 'REF-BRT-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('BRT transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('BRT123456789')
    expect(event.carrierId).toBe('brt')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Spedizione ritirata')
    expect(event.location?.city).toBe('Roma')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when eventi is empty', () => {
    const raw = makeTrackingResponse({ eventi: [] })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('BRT123456789')
  })

  it('handles null location gracefully', () => {
    const raw = makeTrackingResponse({
      eventi: [makeTrackingEvent({ localita: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['RITIRATO', 'PRE_TRANSIT'],
      ['IN_TRANSITO', 'IN_TRANSIT'],
      ['IN_CONSEGNA', 'OUT_FOR_DELIVERY'],
      ['CONSEGNATO', 'DELIVERED'],
      ['MANCATA_CONSEGNA', 'FAILURE'],
      ['RESO', 'RETURN_TO_SENDER'],
      ['IN_GIACENZA', 'AVAILABLE_FOR_PICKUP'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [stato, expected] of cases) {
      const raw = makeTrackingResponse({
        eventi: [makeTrackingEvent({ stato })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('BRT transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('shp-brt-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('BRT123456789')
    expect(result.carrierId).toBe('brt')
    expect(result.serviceCode).toBe('EXPRESS')
    expect(result.reference).toBe('REF-BRT-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Alice Rossi')
    expect(result.originAddress?.city).toBe('Roma')
    expect(result.destinationAddress?.name).toBe('Bob Bianchi')
    expect(result.destinationAddress?.city).toBe('Milano')
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
      ['RITIRATO', 'PENDING'],
      ['IN_TRANSITO', 'IN_TRANSIT'],
      ['IN_CONSEGNA', 'OUT_FOR_DELIVERY'],
      ['CONSEGNATO', 'DELIVERED'],
      ['MANCATA_CONSEGNA', 'EXCEPTION'],
      ['RESO', 'RETURNED'],
      ['ANNULLATO', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipment({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
