import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type PosteItalianeTrackingResponse,
  type PosteItalianeTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/poste-italiane/transform/tracking'
import {
  transformShipment,
  type PosteItalianeShipmentResponse,
} from '../../../../../src/verticals/logistics/adapters/poste-italiane/transform/shipment'
import {
  transformRate,
  type PosteItalianeRate,
} from '../../../../../src/verticals/logistics/adapters/poste-italiane/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<PosteItalianeTrackingEvent> = {}): PosteItalianeTrackingEvent {
  return {
    stato: 'IN_TRANSITO',
    descrizione: 'Spedizione in transito',
    data: '2024-03-15T10:30:00Z',
    filiale: 'Roma Tuscolana',
    localita: 'Roma',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<PosteItalianeTrackingResponse> = {}): PosteItalianeTrackingResponse {
  return {
    tracking_code: 'PI123456789',
    status: 'IN_TRANSITO',
    eventi: [
      makeTrackingEvent({ stato: 'ACCETTATO', descrizione: 'Spedizione accettata', localita: 'Napoli' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<PosteItalianeShipmentResponse> = {}): PosteItalianeShipmentResponse {
  return {
    shipmentId: 'SHP-PI-001',
    barcode: 'PI123456789',
    serviceCode: 'POSTA_RACCOMANDATA',
    status: 'CREATED',
    createdAt: '2024-03-15T10:00:00Z',
    labelData: 'base64encodedlabeldata==',
    ...overrides,
  }
}

function makeRate(overrides: Partial<PosteItalianeRate> = {}): PosteItalianeRate {
  return {
    service_code: 'POSTA_CELERE',
    service_name: 'Poste Celere',
    currency: 'EUR',
    total_amount: 12.50,
    estimated_delivery_days: 1,
    estimated_delivery_date: '2024-03-16T00:00:00Z',
    guaranteed: true,
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('PosteItaliane transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('PI123456789')
    expect(event.carrierId).toBe('poste-italiane')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Spedizione accettata')
    expect(event.location?.city).toBe('Napoli')
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
    expect(events[0].trackingNumber).toBe('PI123456789')
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
      ['ACCETTATO', 'PRE_TRANSIT'],
      ['IN_TRANSITO', 'IN_TRANSIT'],
      ['IN_CONSEGNA', 'OUT_FOR_DELIVERY'],
      ['CONSEGNATO', 'DELIVERED'],
      ['TENTATIVO_FALLITO', 'FAILURE'],
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

describe('PosteItaliane transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-PI-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('PI123456789')
    expect(result.carrierId).toBe('poste-italiane')
    expect(result.serviceCode).toBe('POSTA_RACCOMANDATA')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})

// ─── transformRate ──────────────────────────────────────────────────────────

describe('PosteItaliane transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('poste-italiane')
    expect(result.serviceCode).toBe('POSTA_CELERE')
    expect(result.serviceName).toBe('Poste Celere')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(12.50)
    expect(result.transitDays).toBe(1)
    expect(result.deliveryDays).toBe(1)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.isGuaranteedDelivery).toBe(true)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      service_name: null,
      estimated_delivery_days: null,
      estimated_delivery_date: null,
    })
    const result = transformRate(raw)

    expect(result.serviceName).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(result.deliveryDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })
})
