import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type TruckstopTenderResponse,
} from '../../../../../../../src/verticals/logistics/adapters/truckstop/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// trackingevent.ts re-exports transformTrackingEvents as transformTrackingEvent.
// The input type is TruckstopTenderResponse (same as tracking.ts).

function makeTender(overrides: Partial<TruckstopTenderResponse> = {}): TruckstopTenderResponse {
  return {
    loadNumber: 'LN-002',
    status: 'Delivered',
    statusDescription: 'Load delivered',
    events: [
      {
        eventType: 'Delivered',
        eventDescription: 'Delivered to consignee',
        eventDateTime: '2024-03-05T14:00:00Z',
        location: { city: 'Houston', state: 'TX', zip: '77001', country: 'US' },
      },
    ],
    ...overrides,
  }
}

describe('truckstop transformTrackingEvent (re-export)', () => {
  it('produces one event per raw event', () => {
    expect(transformTrackingEvent(makeTender())).toHaveLength(1)
  })

  it('maps Delivered status to DELIVERED', () => {
    // Verified via LOAD_STATUS_TRACKING_MAP
    expect(transformTrackingEvent(makeTender())[0].status).toBe('DELIVERED')
  })

  it('maps trackingNumber from loadNumber', () => {
    expect(transformTrackingEvent(makeTender())[0].trackingNumber).toBe('LN-002')
  })

  it('maps carrierId to truckstop', () => {
    expect(transformTrackingEvent(makeTender())[0].carrierId).toBe('truckstop')
  })

  it('emits summary event when events is empty', () => {
    const events = transformTrackingEvent(makeTender({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('DELIVERED')
  })

  it('produces schema-valid output', () => {
    transformTrackingEvent(makeTender()).forEach((evt) => {
      expect(() => TrackingEventSchema.parse(evt)).not.toThrow()
    })
  })
})
