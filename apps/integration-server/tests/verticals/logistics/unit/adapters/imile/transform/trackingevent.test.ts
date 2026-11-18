import { describe, it, expect } from 'vitest'
import { transformTrackingEvent } from '../../../../../../../src/verticals/logistics/adapters/imile/transform/trackingevent'
import { transformTracking } from '../../../../../../../src/verticals/logistics/adapters/imile/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { TRACK_GET_ONE_DATA } from '../fixtures'

// trackingevent.ts is a re-export alias of tracking.ts – verify it is wired correctly.

describe('imile transformTrackingEvent (alias)', () => {
  it('is the tracking transform', () => {
    expect(transformTrackingEvent).toBe(transformTracking)
  })

  it('maps the documented getOne example and passes TrackingEventSchema.parse', () => {
    const events = transformTrackingEvent(TRACK_GET_ONE_DATA)
    expect(events).toHaveLength(1)
    for (const event of events) TrackingEventSchema.parse(event)
    expect(events[0]!.trackingNumber).toBe('6063024371258')
  })
})
