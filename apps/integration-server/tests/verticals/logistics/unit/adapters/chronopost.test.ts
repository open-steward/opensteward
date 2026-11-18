import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ChronopostTracking,
  type ChronopostEvent,
} from '../../../../../src/verticals/logistics/adapters/chronopost/transform/tracking'
import {
  transformShipment,
  type ChronopostShipment,
} from '../../../../../src/verticals/logistics/adapters/chronopost/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ChronopostEvent> = {}): ChronopostEvent {
  return {
    code: 'EN_COURS',
    label: 'Colis en cours de traitement',
    date: '2024-03-15T10:30:00Z',
    lieu: 'Paris Hub',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<ChronopostTracking> = {}): ChronopostTracking {
  return {
    skybillNumber: 'XY123456789FR',
    eventInfoComp: null,
    events: [
      makeEvent({ code: 'PRISE_EN_CHARGE', label: 'Prise en charge du colis', lieu: 'Lyon' }),
      makeEvent(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ChronopostShipment> = {}): ChronopostShipment {
  return {
    skybillNumber: 'XY123456789FR',
    status: 'EN_COURS',
    trackingNumber: 'XY123456789FR',
    label_url: 'https://api.chronopost.fr/labels/XY123456789FR.pdf',
    service_code: 'CHRONO_13',
    weight: 2.5,
    weight_unit: 'kg',
    sender: {
      name: 'Marie Dupont',
      address_line1: '10 Rue de Rivoli',
      city: 'Paris',
      postal_code: '75001',
      country: 'FR',
    },
    recipient: {
      name: 'Jean Martin',
      address_line1: '5 Place Bellecour',
      city: 'Lyon',
      postal_code: '69002',
      country: 'FR',
    },
    reference: 'REF-001',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'XY123456789FR')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw, 'XY123456789FR')[0]

    expect(event.trackingNumber).toBe('XY123456789FR')
    expect(event.carrierId).toBe('chronopost')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Prise en charge du colis')
    expect(event.location?.city).toBe('Lyon')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'XY123456789FR')
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTracking({ events: [] })
    const events = transformTracking(raw, 'XY123456789FR')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('XY123456789FR')
  })

  it('handles null lieu gracefully', () => {
    const raw = makeTracking({
      events: [makeEvent({ lieu: null })],
    })
    const event = transformTracking(raw, 'XY123456789FR')[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['PRISE_EN_CHARGE', 'PRE_TRANSIT'],
      ['EN_COURS', 'IN_TRANSIT'],
      ['EN_LIVRAISON', 'OUT_FOR_DELIVERY'],
      ['LIVRE', 'DELIVERED'],
      ['ECHEC_LIVRAISON', 'FAILURE'],
      ['RETOUR', 'RETURN_TO_SENDER'],
      ['ANOMALIE', 'FAILURE'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const raw = makeTracking({
        events: [makeEvent({ code })],
      })
      expect(transformTracking(raw, 'XY123456789FR')[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.id).toBe('XY123456789FR')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('XY123456789FR')
    expect(result.carrierId).toBe('chronopost')
    expect(result.serviceCode).toBe('CHRONO_13')
    expect(result.labelUrl).toContain('XY123456789FR.pdf')
    expect(result.reference).toBe('REF-001')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeShipment()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Marie Dupont')
    expect(result.originAddress?.city).toBe('Paris')
    expect(result.destinationAddress?.name).toBe('Jean Martin')
    expect(result.destinationAddress?.city).toBe('Lyon')
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
      trackingNumber: null,
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
    expect(result.trackingNumber).toBeUndefined()
    expect(result.reference).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['PRISE_EN_CHARGE', 'PENDING'],
      ['EN_COURS', 'IN_TRANSIT'],
      ['EN_LIVRAISON', 'OUT_FOR_DELIVERY'],
      ['LIVRE', 'DELIVERED'],
      ['ECHEC_LIVRAISON', 'EXCEPTION'],
      ['RETOUR', 'RETURNED'],
      ['ANOMALIE', 'EXCEPTION'],
      ['ANNULE', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipment({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
