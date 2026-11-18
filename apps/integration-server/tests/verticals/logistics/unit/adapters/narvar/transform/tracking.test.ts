import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type NarvarTrackingEventRaw,
} from '../../../../../../../src/verticals/logistics/adapters/narvar/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<NarvarTrackingEventRaw> = {}): NarvarTrackingEventRaw {
  return {
    tracking_number: 'NV-TRK-001',
    status: 'IN_TRANSIT',
    status_description: 'Package is on the way',
    event_time: '2024-03-01T00:00:00Z',
    location: {
      city: 'Austin',
      state: 'TX',
      country: 'US',
      zip: '78701',
    },
    ...overrides,
  }
}

describe('transformTracking (narvar)', () => {
  it('always returns an array of length 1', () => {
    expect(transformTracking(makeEvent())).toHaveLength(1)
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformTracking(makeEvent())[0].trackingNumber).toBe('NV-TRK-001')
  })

  it('maps carrierId to "narvar"', () => {
    expect(transformTracking(makeEvent())[0].carrierId).toBe('narvar')
  })

  it('maps status IN_TRANSIT for "IN_TRANSIT"', () => {
    expect(transformTracking(makeEvent())[0].status).toBe('IN_TRANSIT')
  })

  it('maps status IN_TRANSIT for "OUT_FOR_DELIVERY" (source maps both to IN_TRANSIT)', () => {
    // Per source: case 'OUT_FOR_DELIVERY' falls through to IN_TRANSIT
    expect(transformTracking(makeEvent({ status: 'OUT_FOR_DELIVERY' }))[0].status).toBe(
      'IN_TRANSIT',
    )
  })

  it('maps status PRE_TRANSIT for "PRE_TRANSIT"', () => {
    expect(transformTracking(makeEvent({ status: 'PRE_TRANSIT' }))[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status PRE_TRANSIT for "LABEL_CREATED"', () => {
    expect(transformTracking(makeEvent({ status: 'LABEL_CREATED' }))[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status DELIVERED for "DELIVERED"', () => {
    expect(transformTracking(makeEvent({ status: 'DELIVERED' }))[0].status).toBe('DELIVERED')
  })

  it('maps status FAILURE for "EXCEPTION"', () => {
    expect(transformTracking(makeEvent({ status: 'EXCEPTION' }))[0].status).toBe('FAILURE')
  })

  it('maps status FAILURE for "FAILED"', () => {
    expect(transformTracking(makeEvent({ status: 'FAILED' }))[0].status).toBe('FAILURE')
  })

  it('maps status RETURN_TO_SENDER for "RETURN"', () => {
    expect(transformTracking(makeEvent({ status: 'RETURN' }))[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps status UNKNOWN for unrecognised status', () => {
    expect(transformTracking(makeEvent({ status: 'SOMETHING_ELSE' }))[0].status).toBe('UNKNOWN')
  })

  it('maps description from status_description', () => {
    expect(transformTracking(makeEvent())[0].description).toBe('Package is on the way')
  })

  it('maps occurredAt from event_time as Date', () => {
    expect(transformTracking(makeEvent())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('maps location city, state, country, postalCode from zip', () => {
    const evt = transformTracking(makeEvent())[0]
    expect(evt.location?.city).toBe('Austin')
    expect(evt.location?.state).toBe('TX')
    expect(evt.location?.country).toBe('US')
    expect(evt.location?.postalCode).toBe('78701')
  })

  it('omits location when location field is absent', () => {
    expect(transformTracking(makeEvent({ location: undefined }))[0].location).toBeUndefined()
  })

  it('sets occurredAt to undefined when event_time absent', () => {
    expect(transformTracking(makeEvent({ event_time: undefined }))[0].occurredAt).toBeUndefined()
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeEvent()
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })

  it('produces a TrackingEventSchema-valid result', () => {
    const events = transformTracking(makeEvent())
    events.forEach((e) => expect(() => TrackingEventSchema.parse(e)).not.toThrow())
  })
})
