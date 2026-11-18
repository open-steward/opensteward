import { describe, it, expect } from 'vitest'
// trackingevent.ts re-exports transformTracking from tracking.ts — verify the re-export works
import {
  transformTracking,
  type Locate2uTracking,
} from '../../../../../../../src/verticals/logistics/adapters/locate2u/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTracking(o: Partial<Locate2uTracking> = {}): Locate2uTracking {
  return {
    shipmentId: 4004,
    shipmentRef: 'LOC-EVT-001',
    status: 'delivered',
    tripDate: '2024-03-01T00:00:00Z',
    lastModifiedDate: '2024-03-01T00:00:00Z',
    dropStop: {
      stopId: 3,
      status: 'delivered',
      address: '30 Final Ave',
      arrivalDate: '2024-03-01T00:00:00Z',
    },
    ...o,
  }
}

describe('locate2u trackingevent re-export', () => {
  it('re-exports transformTracking from tracking.ts', () => {
    expect(typeof transformTracking).toBe('function')
  })

  it('correctly maps delivered status through re-export', () => {
    expect(transformTracking(makeTracking())[0].status).toBe('DELIVERED')
  })

  it('maps shipmentId through re-export', () => {
    expect(transformTracking(makeTracking())[0].shipmentId).toBe('4004')
  })

  it('validates via TrackingEventSchema through re-export', () => {
    const result = transformTracking(makeTracking())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })
})
