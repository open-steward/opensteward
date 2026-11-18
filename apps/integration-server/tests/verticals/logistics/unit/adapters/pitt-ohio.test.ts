import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type PittOhioTrackingResponse,
  type PittOhioTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/pitt-ohio/transform/tracking'
import {
  transformRate,
  type PittOhioRate,
} from '../../../../../src/verticals/logistics/adapters/pitt-ohio/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<PittOhioTrackingEvent> = {}): PittOhioTrackingEvent {
  return {
    status_code: 'I',
    description: 'Shipment in transit',
    timestamp: '2024-08-01T10:00:00Z',
    terminal: 'PIT',
    city: 'Pittsburgh',
    state: 'PA',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<PittOhioTrackingResponse> = {}): PittOhioTrackingResponse {
  return {
    pro_number: '555666777',
    status: 'I',
    events: [
      makeTrackingEvent({ status_code: 'P', description: 'Picked up', city: 'Columbus', state: 'OH' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeRate(overrides: Partial<PittOhioRate> = {}): PittOhioRate {
  return {
    quote_id: 'Q-PO-001',
    service_code: 'LTL_STANDARD',
    service_name: 'Standard LTL',
    total_charge: 310.75,
    currency: 'USD',
    transit_days: 2,
    delivery_date: '2024-08-03T00:00:00Z',
    guaranteed: true,
    created_at: '2024-08-01T08:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('PITT OHIO transformTracking', () => {
  it('produces one event per tracking event', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]

    expect(event.trackingNumber).toBe('555666777')
    expect(event.carrierId).toBe('pitt-ohio')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Picked up')
    expect(event.location?.city).toBe('Columbus')
    expect(event.location?.state).toBe('OH')
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
      ['I', 'IN_TRANSIT'],
      ['O', 'OUT_FOR_DELIVERY'],
      ['D', 'DELIVERED'],
      ['X', 'FAILURE'],
      ['A', 'IN_TRANSIT'],
      ['Z', 'UNKNOWN'],
    ]
    for (const [statusCode, expected] of cases) {
      const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status_code: statusCode })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformRate ──────────────────────────────────────────────────────────

describe('PITT OHIO transformRate', () => {
  it('maps canonical rate fields', () => {
    const result = transformRate(makeRate())

    expect(result.id).toBe('Q-PO-001')
    expect(result.carrierId).toBe('pitt-ohio')
    expect(result.serviceCode).toBe('LTL_STANDARD')
    expect(result.serviceName).toBe('Standard LTL')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(310.75)
    expect(result.transitDays).toBe(2)
    expect(result.isGuaranteedDelivery).toBe(true)
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
