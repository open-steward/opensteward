import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type EstafetaTrackingResponse,
  type EstafetaTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/estafeta/transform/tracking'
import {
  transformRate,
  type EstafetaRate,
} from '../../../../../src/verticals/logistics/adapters/estafeta/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<EstafetaTrackingEvent> = {}): EstafetaTrackingEvent {
  return {
    status_code: 'EN_RUTA',
    description: 'Envio en ruta',
    timestamp: '2024-11-20T11:00:00Z',
    location: 'Ciudad de Mexico',
    office: 'CDMX-01',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<EstafetaTrackingResponse> = {}): EstafetaTrackingResponse {
  return {
    tracking_number: 'EST123456789',
    status: 'EN_RUTA',
    events: [
      makeTrackingEvent({ status_code: 'DOCUMENTADO', description: 'Envio documentado', location: 'Monterrey' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeRate(overrides: Partial<EstafetaRate> = {}): EstafetaRate {
  return {
    quote_id: 'Q-EST-001',
    service_code: 'TERRESTRE',
    service_name: 'Terrestre',
    total_amount: 250.00,
    currency: 'MXN',
    transit_days: 4,
    delivery_date: '2024-11-24T00:00:00Z',
    created_at: '2024-11-20T08:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]

    expect(event.trackingNumber).toBe('EST123456789')
    expect(event.carrierId).toBe('estafeta')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Envio documentado')
    expect(event.location?.city).toBe('Monterrey')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const events = transformTracking(makeTrackingResponse({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles null location gracefully', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ location: null })] })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['DOCUMENTADO', 'PRE_TRANSIT'],
      ['EN_RUTA', 'IN_TRANSIT'],
      ['EN_REPARTO', 'OUT_FOR_DELIVERY'],
      ['ENTREGADO', 'DELIVERED'],
      ['NO_ENTREGADO', 'FAILURE'],
      ['DEVUELTO', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [statusCode, expected] of cases) {
      const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status_code: statusCode })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformRate ──────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical rate fields', () => {
    const result = transformRate(makeRate())

    expect(result.id).toBe('Q-EST-001')
    expect(result.carrierId).toBe('estafeta')
    expect(result.serviceCode).toBe('TERRESTRE')
    expect(result.serviceName).toBe('Terrestre')
    expect(result.currency).toBe('MXN')
    expect(result.totalAmount).toBe(250.00)
    expect(result.transitDays).toBe(4)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      quote_id: null, service_code: null, service_name: null,
      total_amount: null, currency: null, transit_days: null,
      delivery_date: null, created_at: null,
    })
    const result = transformRate(raw)
    expect(result.id).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.currency).toBe('MXN')
    expect(result.transitDays).toBeUndefined()
  })
})
