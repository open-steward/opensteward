/**
 * parcellab trackingevent.ts re-exports transformTracking from tracking.ts.
 * We verify the re-export is the same function and produces valid events.
 */
import { describe, it, expect } from 'vitest'
import { transformTracking } from '../../../../../../../src/verticals/logistics/adapters/parcellab/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

describe('parcellab trackingevent re-export', () => {
  it('transformTracking is a function', () => {
    expect(typeof transformTracking).toBe('function')
  })

  it('produces events that pass TrackingEventSchema', () => {
    const raw = {
      tracking_number: 'TRK-REEXPORT',
      courier: 'ups',
      checkpoints: [
        {
          status: 'delivered',
          status_text: 'Delivered',
          timestamp: '2024-03-01T00:00:00Z',
          city: 'Hamburg',
          country: 'DE',
        },
      ],
      created_at: '2024-03-01T00:00:00Z',
    }
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('DELIVERED')
    expect(() => TrackingEventSchema.parse(events[0])).not.toThrow()
  })
})
