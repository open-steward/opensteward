import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type TopshipTracking,
} from '../../../../../../../src/verticals/logistics/adapters/topship/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// trackingevent.ts re-exports transformTracking as transformTrackingEvent
function makeTracking(overrides: Partial<TopshipTracking> = {}): TopshipTracking {
  return {
    id: 'ts-002',
    trackingId: 'TTRK002',
    status: 'Delivered',
    message: 'Delivered successfully',
    createdDate: '2024-03-01T00:00:00Z',
    updatedDate: '2024-03-03T00:00:00Z',
    ...overrides,
  }
}

describe('topship trackingevent re-export', () => {
  it('re-exports transformTracking as transformTrackingEvent', () => {
    const r = transformTrackingEvent(makeTracking())
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('DELIVERED')
    expect(r[0].shipmentId).toBe('ts-002')
    expect(r[0].trackingNumber).toBe('TTRK002')
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTrackingEvent(makeTracking())
    for (const event of result) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
