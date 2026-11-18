import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type AverittTrackingResponse,
  type AverittTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/averitt/transform/tracking'
import {
  transformRate,
  type AverittRate,
} from '../../../../../src/verticals/logistics/adapters/averitt/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<AverittTrackingEvent> = {}): AverittTrackingEvent {
  return {
    status_code: 'T',
    description: 'Shipment in transit',
    timestamp: '2024-08-01T10:00:00Z',
    terminal: 'ATL',
    city: 'Atlanta',
    state: 'GA',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<AverittTrackingResponse> = {}): AverittTrackingResponse {
  return {
    pro_number: '987654321',
    status: 'T',
    events: [
      makeTrackingEvent({ status_code: 'P', description: 'Picked up', city: 'Nashville', state: 'TN' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeRate(overrides: Partial<AverittRate> = {}): AverittRate {
  return {
    quote_id: 'Q-AVR-001',
    service_code: 'LTL_STANDARD',
    service_name: 'Standard LTL',
    total_charge: 275.00,
    currency: 'USD',
    transit_days: 3,
    delivery_date: '2024-08-04T00:00:00Z',
    guaranteed: false,
    created_at: '2024-08-01T08:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('Averitt transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]

    expect(event.trackingNumber).toBe('987654321')
    expect(event.carrierId).toBe('averitt')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Picked up')
    expect(event.location?.city).toBe('Nashville')
    expect(event.location?.state).toBe('TN')
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

  it('handles null city gracefully', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ city: null })] })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['P', 'PRE_TRANSIT'],
      ['T', 'IN_TRANSIT'],
      ['O', 'OUT_FOR_DELIVERY'],
      ['D', 'DELIVERED'],
      ['X', 'FAILURE'],
      ['H', 'IN_TRANSIT'],
      ['Z', 'UNKNOWN'],
    ]
    for (const [statusCode, expected] of cases) {
      const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status_code: statusCode })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformRate ──────────────────────────────────────────────────────────

describe('Averitt transformRate', () => {
  it('maps canonical rate fields', () => {
    const result = transformRate(makeRate())

    expect(result.id).toBe('Q-AVR-001')
    expect(result.carrierId).toBe('averitt')
    expect(result.serviceCode).toBe('LTL_STANDARD')
    expect(result.serviceName).toBe('Standard LTL')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(275.00)
    expect(result.transitDays).toBe(3)
    expect(result.isGuaranteedDelivery).toBe(false)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      quote_id: null, service_code: null, service_name: null,
      total_charge: null, currency: null, transit_days: null,
      delivery_date: null, guaranteed: null, created_at: null,
    })
    const result = transformRate(raw)
    expect(result.id).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.currency).toBe('USD')
    expect(result.transitDays).toBeUndefined()
    expect(result.isGuaranteedDelivery).toBeUndefined()
  })
})
