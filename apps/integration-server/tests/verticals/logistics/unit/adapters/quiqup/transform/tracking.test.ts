import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type QuiqupTrackingResponse,
  type QuiqupTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/quiqup/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<QuiqupTrackingEvent> = {}): QuiqupTrackingEvent {
  return {
    id: 'evt-001',
    status: 'in_transit',
    description: 'Package in transit',
    occurred_at: '2024-03-01T10:00:00Z',
    location: { city: 'Dubai', country_code: 'AE', postcode: '12345' },
    ...overrides,
  }
}

function makeRaw(overrides: Partial<QuiqupTrackingResponse> = {}): QuiqupTrackingResponse {
  return {
    job_id: 'job-qq-001',
    tracking_number: 'QQ123456789',
    status: 'in_transit',
    events: [makeEvent()],
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ────────────────────────────────────────────────────────

describe('Quiqup transformTracking', () => {
  it('produces one event per raw event', () => {
    const events = transformTracking(makeRaw())
    expect(events).toHaveLength(1)
  })

  it('maps carrierId and trackingNumber from envelope', () => {
    const event = transformTracking(makeRaw())[0]
    expect(event.carrierId).toBe('quiqup')
    expect(event.trackingNumber).toBe('QQ123456789')
    expect(event.shipmentId).toBe('job-qq-001')
  })

  it('maps status from event.status', () => {
    const event = transformTracking(makeRaw())[0]
    expect(event.status).toBe('IN_TRANSIT')
  })

  it('maps event description and location', () => {
    const event = transformTracking(makeRaw())[0]
    expect(event.description).toBe('Package in transit')
    expect(event.location?.city).toBe('Dubai')
    expect(event.location?.country).toBe('AE')
    expect(event.location?.postalCode).toBe('12345')
  })

  it('parses occurredAt to Date', () => {
    const event = transformTracking(makeRaw())[0]
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('synthesises a single UNKNOWN event when events array is empty', () => {
    const events = transformTracking(makeRaw({ events: [], status: undefined }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('synthesises from top-level status when no events', () => {
    const events = transformTracking(makeRaw({ events: [], status: 'delivered' }))
    expect(events[0].status).toBe('DELIVERED')
  })

  it('maps all event statuses correctly', () => {
    const cases: [string, string][] = [
      ['pending', 'PRE_TRANSIT'],
      ['created', 'PRE_TRANSIT'],
      ['accepted', 'PRE_TRANSIT'],
      ['assigned', 'PRE_TRANSIT'],
      ['collected', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['at_hub', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['with_courier', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['completed', 'DELIVERED'],
      ['available_for_pickup', 'AVAILABLE_FOR_PICKUP'],
      ['returned', 'RETURN_TO_SENDER'],
      ['return_to_sender', 'RETURN_TO_SENDER'],
      ['failed', 'FAILURE'],
      ['delivery_failed', 'FAILURE'],
      ['exception', 'FAILURE'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeRaw({ events: [makeEvent({ status })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })

  it('returns undefined location when location fields are all absent', () => {
    const raw = makeRaw({
      events: [makeEvent({ location: { city: null, country_code: null, postcode: null } })],
    })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    const event = transformTracking(makeRaw())[0]
    expect(() => TrackingEventSchema.parse(event)).not.toThrow()
  })
})
