import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ColissimoTrackingResponse,
  type ColissimoTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/colissimo/transform/tracking'
import {
  transformRate,
  type ColissimoRate,
} from '../../../../../src/verticals/logistics/adapters/colissimo/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<ColissimoTrackingEvent> = {}): ColissimoTrackingEvent {
  return {
    code: 'EN_COURS_ACHEMINEMENT',
    label: 'Colis en cours acheminement',
    date: '2024-07-12T14:30:00Z',
    site: 'Paris Centre',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<ColissimoTrackingResponse> = {}): ColissimoTrackingResponse {
  return {
    idShip: '6A12345678901',
    holder: 1,
    events: [
      makeTrackingEvent({ code: 'PRIS_EN_CHARGE', label: 'Pris en charge', site: 'Lyon' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeRate(overrides: Partial<ColissimoRate> = {}): ColissimoRate {
  return {
    id: 'rate-col-001',
    product_code: 'DOM',
    product_name: 'Colissimo Domicile',
    price: 8.95,
    currency: 'EUR',
    delivery_days: 2,
    delivery_date: '2024-07-14T00:00:00Z',
    created_at: '2024-07-12T10:00:00Z',
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

    expect(event.trackingNumber).toBe('6A12345678901')
    expect(event.carrierId).toBe('colissimo')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Pris en charge')
    expect(event.location?.city).toBe('Lyon')
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
    expect(events[0].trackingNumber).toBe('6A12345678901')
  })

  it('handles null site gracefully', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ site: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['PRIS_EN_CHARGE', 'PRE_TRANSIT'],
      ['EN_COURS_ACHEMINEMENT', 'IN_TRANSIT'],
      ['EN_LIVRAISON', 'OUT_FOR_DELIVERY'],
      ['LIVRE', 'DELIVERED'],
      ['AVIS_DE_PASSAGE', 'FAILURE'],
      ['RETOUR', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ code })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformRate ──────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical rate fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('rate-col-001')
    expect(result.carrierId).toBe('colissimo')
    expect(result.serviceCode).toBe('DOM')
    expect(result.serviceName).toBe('Colissimo Domicile')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(8.95)
    expect(result.transitDays).toBe(2)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      id: null,
      product_name: null,
      price: null,
      currency: null,
      delivery_days: null,
      delivery_date: null,
      created_at: null,
    })
    const result = transformRate(raw)

    expect(result.id).toBeUndefined()
    expect(result.serviceName).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.currency).toBe('EUR')
    expect(result.transitDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })
})
