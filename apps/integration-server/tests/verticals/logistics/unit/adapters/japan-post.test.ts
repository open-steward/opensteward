import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type JapanPostTrackingResponse,
  type JapanPostTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/japan-post/transform/tracking'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<JapanPostTrackingEvent> = {}): JapanPostTrackingEvent {
  return {
    status: 'transit',
    detail: 'Item in transit',
    date: '2024-03-15',
    time: '10:30:00',
    office: 'Tokyo Central',
    prefecture: 'Tokyo',
    country: 'JP',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<JapanPostTrackingResponse> = {}): JapanPostTrackingResponse {
  return {
    tracking_number: 'EJ123456789JP',
    status: 'transit',
    events: [
      makeTrackingEvent({ status: 'posting', detail: 'Item posted', office: 'Osaka Namba' }),
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

    expect(event.trackingNumber).toBe('EJ123456789JP')
    expect(event.carrierId).toBe('japan-post')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Item posted')
    expect(event.location?.city).toBe('Osaka Namba')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('combines date and time for occurredAt', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ date: '2024-03-15', time: '14:30:00' })],
    })
    const event = transformTracking(raw)[0]
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('uses date only when time is null', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ date: '2024-03-15', time: null })],
    })
    const event = transformTracking(raw)[0]
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
    expect(events[0].trackingNumber).toBe('EJ123456789JP')
  })

  it('handles missing location fields gracefully', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ office: null, prefecture: null, country: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps location with prefecture and country', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ office: null, prefecture: 'Osaka', country: 'JP' })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location?.state).toBe('Osaka')
    expect(event.location?.country).toBe('JP')
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['posting', 'PRE_TRANSIT'],
      ['transit', 'IN_TRANSIT'],
      ['arrival', 'IN_TRANSIT'],
      ['attempt', 'FAILURE'],
      ['delivery', 'DELIVERED'],
      ['return', 'RETURN_TO_SENDER'],
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
