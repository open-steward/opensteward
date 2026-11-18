import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type ShippifyTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/shippify/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// trackingevent.ts is a thin re-export of transformTrackingResponse from ./tracking
// We verify the alias forwards correctly.

function makeRaw(overrides: Partial<ShippifyTrackingResponse> = {}): ShippifyTrackingResponse {
  return {
    token: 'TRK-RE-EXPORT-001',
    url: 'https://track.shippify.co/TRK-RE-EXPORT-001',
    ...overrides,
  }
}

describe('transformTrackingEvent (shippify re-export)', () => {
  it('returns an array with one event', () => {
    expect(transformTrackingEvent(makeRaw())).toHaveLength(1)
  })

  it('maps token to trackingNumber via re-exported function', () => {
    const [event] = transformTrackingEvent(makeRaw())
    expect(event.trackingNumber).toBe('TRK-RE-EXPORT-001')
  })

  it('status is UNKNOWN (same as transformTrackingResponse)', () => {
    const [event] = transformTrackingEvent(makeRaw())
    expect(event.status).toBe('UNKNOWN')
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    const [event] = transformTrackingEvent(makeRaw())
    expect(() => TrackingEventSchema.parse(event)).not.toThrow()
  })
})
