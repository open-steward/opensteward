import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type TurvoTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/turvo/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<TurvoTrackingEvent> = {}): TurvoTrackingEvent {
  return {
    id: 'TEVT-001',
    status: 'in_transit',
    description: 'Shipment is in transit',
    city: 'Chicago',
    state: 'IL',
    country: 'US',
    occurredAt: '2024-03-02T12:00:00Z',
    ...overrides,
  }
}

describe('turvo transformTrackingEvent', () => {
  it('maps id', () => {
    expect(transformTrackingEvent(makeEvent()).id).toBe('TEVT-001')
  })

  it('maps in_transit status to IN_TRANSIT', () => {
    // STATUS_MAP: in_transit → 'IN_TRANSIT'
    expect(transformTrackingEvent(makeEvent()).status).toBe('IN_TRANSIT')
  })

  it('maps picked_up status to IN_TRANSIT', () => {
    // STATUS_MAP: picked_up → 'IN_TRANSIT'
    expect(transformTrackingEvent(makeEvent({ status: 'picked_up' })).status).toBe('IN_TRANSIT')
  })

  it('maps created status to PRE_TRANSIT', () => {
    // STATUS_MAP: created → 'PRE_TRANSIT'
    expect(transformTrackingEvent(makeEvent({ status: 'created' })).status).toBe('PRE_TRANSIT')
  })

  it('maps delivered status to DELIVERED', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps out_for_delivery status to OUT_FOR_DELIVERY', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'out_for_delivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps exception status to FAILURE', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'exception' })).status).toBe('FAILURE')
  })

  it('maps cancelled status to FAILURE', () => {
    // STATUS_MAP: cancelled → 'FAILURE'
    expect(transformTrackingEvent(makeEvent({ status: 'cancelled' })).status).toBe('FAILURE')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'NOPE' })).status).toBe('UNKNOWN')
  })

  it('returns undefined status when status is absent', () => {
    expect(transformTrackingEvent(makeEvent({ status: undefined })).status).toBeUndefined()
  })

  it('maps description', () => {
    expect(transformTrackingEvent(makeEvent()).description).toBe('Shipment is in transit')
  })

  it('maps location with city, state, country', () => {
    const loc = transformTrackingEvent(makeEvent()).location
    expect(loc?.city).toBe('Chicago')
    expect(loc?.state).toBe('IL')
    expect(loc?.country).toBe('US')
  })

  it('omits location when city/state/country are all absent', () => {
    const result = transformTrackingEvent(
      makeEvent({ city: undefined, state: undefined, country: undefined }),
    )
    expect(result.location).toBeUndefined()
  })

  it('maps occurredAt as Date', () => {
    expect(transformTrackingEvent(makeEvent()).occurredAt).toBeInstanceOf(Date)
  })

  it('produces schema-valid output', () => {
    expect(() => TrackingEventSchema.parse(transformTrackingEvent(makeEvent()))).not.toThrow()
  })
})
