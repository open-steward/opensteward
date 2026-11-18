import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type HongkongPostTrackingResponse,
  type HongkongPostTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/hongkong-post/transform/tracking'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<HongkongPostTrackingEvent> = {}): HongkongPostTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Item in transit',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Hong Kong International Mail Centre',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<HongkongPostTrackingResponse> = {}): HongkongPostTrackingResponse {
  return {
    tracking_number: 'HK123456789HK',
    status: 'IN_TRANSIT',
    events: [
      makeTrackingEvent({ status: 'POSTED', description: 'Item posted', location: 'Central Post Office' }),
      makeTrackingEvent(),
    ],
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

    expect(event.trackingNumber).toBe('HK123456789HK')
    expect(event.carrierId).toBe('hongkong-post')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Item posted')
    expect(event.location?.city).toBe('Central Post Office')
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
    expect(events[0].trackingNumber).toBe('HK123456789HK')
  })

  it('handles null location gracefully', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ location: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['POSTED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['ARRIVED', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['UNSUCCESSFUL', 'FAILURE'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ status })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})
