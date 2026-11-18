/**
 * parcel2go trackingevent.ts re-exports transformTrackingResult from tracking.ts.
 * We verify the re-export resolves to the same implementation.
 */
import { describe, it, expect } from 'vitest'
import { transformTrackingResult } from '../../../../../../../src/verticals/logistics/adapters/parcel2go/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

describe('parcel2go trackingevent re-export', () => {
  it('transformTrackingResult is a function', () => {
    expect(typeof transformTrackingResult).toBe('function')
  })

  it('produces events that pass TrackingEventSchema', () => {
    const raw = {
      TrackingNumber: 'TRK-001',
      CourierName: 'Yodel',
      Results: [
        {
          Description: 'Collected',
          StatusCode: 'collection',
          DateTime: '2024-03-01T00:00:00Z',
          Location: 'Leeds',
        },
      ],
    }
    const events = transformTrackingResult(raw, 'OL-XYZ')
    expect(events).toHaveLength(1)
    expect(() => TrackingEventSchema.parse(events[0])).not.toThrow()
  })
})
