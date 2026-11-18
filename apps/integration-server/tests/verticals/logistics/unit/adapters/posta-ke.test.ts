import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type PostaKeTracking,
  type PostaKeTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/posta-ke/transform/tracking'

// --- Factories -------------------------------------------------------------

function makeEvent(overrides: Partial<PostaKeTrackingEvent> = {}): PostaKeTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Item in transit to destination',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Nairobi Sorting Centre',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<PostaKeTracking> = {}): PostaKeTracking {
  return {
    trackingNumber: 'PKE123456789',
    currentStatus: 'IN_TRANSIT',
    events: [
      makeEvent({ status: 'POSTED', description: 'Item posted', location: 'Mombasa Post Office' }),
      makeEvent(),
    ],
    ...overrides,
  }
}

// --- transformTracking -----------------------------------------------------

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'PKE123456789')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTracking()
    const event = transformTracking(raw, 'PKE123456789')[0]

    expect(event.trackingNumber).toBe('PKE123456789')
    expect(event.carrierId).toBe('posta-ke')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Item posted')
    expect(event.location?.city).toBe('Mombasa Post Office')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTracking()
    const events = transformTracking(raw, 'PKE123456789')
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTracking({ events: [] })
    const events = transformTracking(raw, 'PKE123456789')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('PKE123456789')
  })

  it('handles null location gracefully', () => {
    const raw = makeTracking({
      events: [makeEvent({ location: null })],
    })
    const event = transformTracking(raw, 'PKE123456789')[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['POSTED', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['AT_OFFICE', 'AVAILABLE_FOR_PICKUP'],
      ['DELIVERED', 'DELIVERED'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['EXCEPTION', 'FAILURE'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTracking({
        events: [makeEvent({ status })],
      })
      expect(transformTracking(raw, 'PKE123456789')[0].status).toBe(expected)
    }
  })
})
