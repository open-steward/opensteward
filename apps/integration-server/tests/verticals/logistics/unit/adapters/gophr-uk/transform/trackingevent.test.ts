import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type GophrUkTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/gophr-uk/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

/**
 * trackingevent.ts is a thin re-export of transformTrackingEvents from tracking.ts,
 * aliased as transformTrackingEvent. These tests confirm the re-export wires up
 * correctly and produces schema-valid output.
 */

function makeResponse(overrides: Partial<GophrUkTrackingResponse> = {}): GophrUkTrackingResponse {
  return {
    job_id: 'job-001',
    delivery_id: 'delivery-abc',
    status: 'en_route',
    status_label: 'En Route',
    updated_time: '2024-03-01T11:00:00Z',
    created_time: '2024-03-01T09:00:00Z',
    events: [],
    ...overrides,
  }
}

describe('Gophr UK transformTrackingEvent (re-export)', () => {
  it('is a function', () => {
    expect(typeof transformTrackingEvent).toBe('function')
  })

  it('returns an array', () => {
    const result = transformTrackingEvent(makeResponse())
    expect(Array.isArray(result)).toBe(true)
  })

  it('maps en_route → IN_TRANSIT via synthetic event', () => {
    const result = transformTrackingEvent(makeResponse())
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps carrierId to gophr-uk', () => {
    const result = transformTrackingEvent(makeResponse())
    expect(result[0].carrierId).toBe('gophr-uk')
  })

  it('maps trackingNumber from job_id', () => {
    const result = transformTrackingEvent(makeResponse())
    expect(result[0].trackingNumber).toBe('job-001')
  })

  it('expands events when present', () => {
    const response = makeResponse({
      events: [
        { timestamp: '2024-03-01T10:00:00Z', status: 'collected', description: 'Picked up' },
        { timestamp: '2024-03-01T11:00:00Z', status: 'en_route', description: 'En route' },
      ],
    })
    const result = transformTrackingEvent(response)
    expect(result).toHaveLength(2)
    expect(result[0].status).toBe('IN_TRANSIT')
    expect(result[1].status).toBe('IN_TRANSIT')
  })

  it('produces output that parses against TrackingEventSchema', () => {
    const events = transformTrackingEvent(makeResponse())
    for (const evt of events) {
      expect(() => TrackingEventSchema.parse(evt)).not.toThrow()
    }
  })
})
