import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type RawPplCzTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/ppl-cz/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// trackingevent.ts re-exports transformParcelStatus as transformTrackingEvent.
// These tests verify the alias contract and ensure the schema validates the output.

describe('transformTrackingEvent (alias for transformParcelStatus)', () => {
  it('is a function', () => {
    expect(typeof transformTrackingEvent).toBe('function')
  })

  it('maps shipmentNumber and stateCode correctly', () => {
    const raw: RawPplCzTrackingEvent = {
      shipmentNumber: '41000077777',
      stateCode: 10,
      stateName: 'In transit',
      events: [
        {
          stateCode: 10,
          stateName: 'In transit',
          eventDate: '2024-03-01T00:00:00Z',
          location: { city: 'Brno', country: 'CZ', zipCode: '60200' },
        },
      ],
    }
    const events = transformTrackingEvent(raw)
    expect(events[0].trackingNumber).toBe('41000077777')
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('passes schema parse', () => {
    const raw: RawPplCzTrackingEvent = {
      shipmentNumber: '41000088888',
      stateCode: 20,
      stateName: 'Delivered',
      events: [
        {
          stateCode: 20,
          stateName: 'Delivered',
          eventDate: '2024-03-01T00:00:00Z',
        },
      ],
    }
    const events = transformTrackingEvent(raw)
    events.forEach((e) => expect(() => TrackingEventSchema.parse(e)).not.toThrow())
  })
})
