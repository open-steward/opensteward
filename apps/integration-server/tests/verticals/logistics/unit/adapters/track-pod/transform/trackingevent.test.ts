import { describe, it, expect } from 'vitest'
import { transformTrackingEvent } from '../../../../../../../src/verticals/logistics/adapters/track-pod/transform/trackingevent'
import type { TrackPodOrder } from '../../../../../../../src/verticals/logistics/adapters/track-pod/transform/order'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// trackingevent.ts re-exports transformTracking as transformTrackingEvent
function makeOrder(overrides: Partial<TrackPodOrder> = {}): TrackPodOrder {
  return {
    Id: 'ord-002',
    Number: 'ORD-002',
    TrackId: 'TRK-002',
    Date: '2024-03-01T00:00:00Z',
    Status: 'scheduled',
    ContactName: 'Bob Jones',
    ...overrides,
  }
}

describe('track-pod trackingevent re-export', () => {
  it('re-exports transformTracking as transformTrackingEvent', () => {
    const r = transformTrackingEvent(makeOrder())
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('PRE_TRANSIT')
    expect(r[0].shipmentId).toBe('ord-002')
    expect(r[0].trackingNumber).toBe('TRK-002')
    expect(r[0].carrierId).toBe('track-pod')
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTrackingEvent(makeOrder())
    for (const event of result) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
