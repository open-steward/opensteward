import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type RplusLTrackingResponse,
  type RplusLTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/rplust/transform/tracking'
import {
  transformRate,
  type RplusLRate,
} from '../../../../../src/verticals/logistics/adapters/rplust/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<RplusLTrackingEvent> = {}): RplusLTrackingEvent {
  return {
    status_code: 'T',
    description: 'Shipment in transit',
    timestamp: '2024-03-15T10:00:00Z',
    city: 'Atlanta',
    state: 'GA',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<RplusLTrackingResponse> = {}): RplusLTrackingResponse {
  return {
    pro_number: '555666777',
    status: 'T',
    events: [
      makeTrackingEvent({ status_code: 'P', description: 'Picked up', city: 'Miami', state: 'FL' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeRate(overrides: Partial<RplusLRate> = {}): RplusLRate {
  return {
    quote_id: 'Q-RL-001',
    service_code: 'LTL_STANDARD',
    service_name: 'Standard LTL',
    total_charge: 425.50,
    currency: 'USD',
    transit_days: 3,
    delivery_date: '2024-03-18T00:00:00Z',
    guaranteed: true,
    created_at: '2024-03-15T08:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('R+L Carriers transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('555666777')
    expect(event.carrierId).toBe('rplust')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Picked up')
    expect(event.location?.city).toBe('Miami')
    expect(event.location?.state).toBe('FL')
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
    expect(events[0].trackingNumber).toBe('555666777')
  })

  it('handles null location gracefully', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ city: null, state: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['P', 'PRE_TRANSIT'],
      ['T', 'IN_TRANSIT'],
      ['O', 'OUT_FOR_DELIVERY'],
      ['D', 'DELIVERED'],
      ['X', 'FAILURE'],
      ['Z', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ status_code: code })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformRate ──────────────────────────────────────────────────────────

describe('R+L Carriers transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('Q-RL-001')
    expect(result.carrierId).toBe('rplust')
    expect(result.serviceCode).toBe('LTL_STANDARD')
    expect(result.serviceName).toBe('Standard LTL')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(425.50)
    expect(result.transitDays).toBe(3)
    expect(result.isGuaranteedDelivery).toBe(true)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      quote_id: null,
      service_code: null,
      service_name: null,
      total_charge: null,
      transit_days: null,
      delivery_date: null,
      guaranteed: null,
      created_at: null,
    })
    const result = transformRate(raw)

    expect(result.id).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
    expect(result.isGuaranteedDelivery).toBeUndefined()
  })
})
