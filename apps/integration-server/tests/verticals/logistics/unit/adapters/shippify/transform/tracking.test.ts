import { describe, it, expect } from 'vitest'
import {
  transformTrackingResponse,
  type ShippifyTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/shippify/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTrackingResponse(
  overrides: Partial<ShippifyTrackingResponse> = {},
): ShippifyTrackingResponse {
  return {
    token: 'TRK-ABC-001',
    url: 'https://track.shippify.co/TRK-ABC-001',
    recipient: { name: 'John Smith' },
    ...overrides,
  }
}

describe('transformTrackingResponse (shippify)', () => {
  it('always returns exactly one event', () => {
    expect(transformTrackingResponse(makeTrackingResponse())).toHaveLength(1)
  })

  it('maps token to trackingNumber', () => {
    const [event] = transformTrackingResponse(makeTrackingResponse())
    expect(event.trackingNumber).toBe('TRK-ABC-001')
  })

  it('maps url to description (public tracking link)', () => {
    const [event] = transformTrackingResponse(makeTrackingResponse())
    expect(event.description).toBe('https://track.shippify.co/TRK-ABC-001')
  })

  it('status is always UNKNOWN (synthetic event)', () => {
    const [event] = transformTrackingResponse(makeTrackingResponse())
    expect(event.status).toBe('UNKNOWN')
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    const [event] = transformTrackingResponse(makeTrackingResponse())
    expect(() => TrackingEventSchema.parse(event)).not.toThrow()
  })

  it('handles missing token gracefully', () => {
    const [event] = transformTrackingResponse(makeTrackingResponse({ token: null }))
    expect(event.trackingNumber).toBeUndefined()
    expect(() => TrackingEventSchema.parse(event)).not.toThrow()
  })

  it('sets metadata to the raw input', () => {
    const raw = makeTrackingResponse()
    const [event] = transformTrackingResponse(raw)
    expect(event.metadata).toBe(raw)
  })
})
