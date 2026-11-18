import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  transformTrackingEvents,
  type DeliverectCourierEvent,
} from '../../../../../../../src/verticals/logistics/adapters/deliverect/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(o: Partial<DeliverectCourierEvent> = {}): DeliverectCourierEvent {
  return {
    externalJobId: 'ext-job-001',
    jobId: 'job-ref-001',
    status: 'in_transit',
    description: 'Courier picked up order',
    location: {
      address1: '100 Restaurant Row',
      city: 'Chicago',
      state: 'IL',
      postalCode: '60601',
      country: 'US',
    },
    timestamp: '2024-03-01T10:00:00Z',
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T10:05:00Z',
    ...o,
  }
}

describe('deliverect transformTrackingEvent', () => {
  it('maps externalJobId to shipmentId', () => {
    const result = transformTrackingEvent(makeEvent())
    expect(result.shipmentId).toBe('ext-job-001')
  })

  it('uses jobId as shipmentId when externalJobId is null', () => {
    const result = transformTrackingEvent(makeEvent({ externalJobId: null }))
    expect(result.shipmentId).toBe('job-ref-001')
  })

  it('maps externalJobId to trackingNumber', () => {
    const result = transformTrackingEvent(makeEvent())
    expect(result.trackingNumber).toBe('ext-job-001')
  })

  it('maps carrierId to deliverect', () => {
    const result = transformTrackingEvent(makeEvent())
    expect(result.carrierId).toBe('deliverect')
  })

  it('maps in_transit status to IN_TRANSIT', () => {
    const result = transformTrackingEvent(makeEvent())
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps created status to PRE_TRANSIT', () => {
    const result = transformTrackingEvent(makeEvent({ status: 'created' }))
    expect(result.status).toBe('PRE_TRANSIT')
  })

  it('maps pending status to PRE_TRANSIT', () => {
    const result = transformTrackingEvent(makeEvent({ status: 'pending' }))
    expect(result.status).toBe('PRE_TRANSIT')
  })

  it('maps delivered status to DELIVERED', () => {
    const result = transformTrackingEvent(makeEvent({ status: 'delivered' }))
    expect(result.status).toBe('DELIVERED')
  })

  it('maps out_for_delivery to OUT_FOR_DELIVERY', () => {
    const result = transformTrackingEvent(makeEvent({ status: 'out_for_delivery' }))
    expect(result.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps returned status to RETURN_TO_SENDER', () => {
    const result = transformTrackingEvent(makeEvent({ status: 'returned' }))
    expect(result.status).toBe('RETURN_TO_SENDER')
  })

  it('maps cancelled status to FAILURE', () => {
    const result = transformTrackingEvent(makeEvent({ status: 'cancelled' }))
    expect(result.status).toBe('FAILURE')
  })

  it('maps failed status to FAILURE', () => {
    const result = transformTrackingEvent(makeEvent({ status: 'failed' }))
    expect(result.status).toBe('FAILURE')
  })

  it('maps unknown status to UNKNOWN', () => {
    const result = transformTrackingEvent(makeEvent({ status: 'something_new' }))
    expect(result.status).toBe('UNKNOWN')
  })

  it('maps description', () => {
    const result = transformTrackingEvent(makeEvent())
    expect(result.description).toBe('Courier picked up order')
  })

  it('maps location city', () => {
    const result = transformTrackingEvent(makeEvent())
    expect(result.location?.city).toBe('Chicago')
  })

  it('maps timestamp to occurredAt', () => {
    const result = transformTrackingEvent(makeEvent())
    expect(result.occurredAt).toBeInstanceOf(Date)
    expect(result.occurredAt?.toISOString()).toBe('2024-03-01T10:00:00.000Z')
  })

  it('falls back to updated when timestamp is null', () => {
    const result = transformTrackingEvent(makeEvent({ timestamp: null }))
    expect(result.occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to created when timestamp and updated are null', () => {
    const result = transformTrackingEvent(makeEvent({ timestamp: null, updated: null }))
    expect(result.occurredAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTrackingEvent(makeEvent())
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })
})

describe('deliverect transformTrackingEvents', () => {
  it('wraps single event in array', () => {
    const result = transformTrackingEvents(makeEvent())
    expect(result).toHaveLength(1)
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTrackingEvents(makeEvent())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })
})
