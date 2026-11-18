import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ShypliteTracking,
  type ShypliteTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/shyplite/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<ShypliteTrackingEvent> = {}): ShypliteTrackingEvent {
  return {
    status: 'in transit',
    description: 'Shipment picked up',
    remark: null,
    timestamp: '2024-03-01T00:00:00Z',
    city: 'Mumbai',
    state: 'MH',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<ShypliteTracking> = {}): ShypliteTracking {
  return {
    tracking_number: 'AWB123456',
    status: 'in transit',
    scans: [makeEvent()],
    ...overrides,
  }
}

describe('Shyplite transformTracking', () => {
  it('maps one event per scan', () => {
    const events = transformTracking(makeTracking({ scans: [makeEvent(), makeEvent()] }))
    expect(events).toHaveLength(2)
  })

  it('maps tracking_number to trackingNumber and carrierId to shyplite', () => {
    const event = transformTracking(makeTracking())[0]
    expect(event.trackingNumber).toBe('AWB123456')
    expect(event.carrierId).toBe('shyplite')
  })

  it('maps "in transit" scan status to IN_TRANSIT', () => {
    const event = transformTracking(makeTracking())[0]
    expect(event.status).toBe('IN_TRANSIT')
  })

  it('maps description from scan description field', () => {
    const event = transformTracking(makeTracking())[0]
    expect(event.description).toBe('Shipment picked up')
  })

  it('maps location city and state from scan', () => {
    const event = transformTracking(makeTracking())[0]
    expect(event.location?.city).toBe('Mumbai')
    expect(event.location?.state).toBe('MH')
  })

  it('maps timestamp to occurredAt as Date', () => {
    const event = transformTracking(makeTracking())[0]
    expect(event.occurredAt).toBeInstanceOf(Date)
    expect(event.occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes TrackingEventSchema validation', () => {
    const event = transformTracking(makeTracking())[0]
    expect(() => TrackingEventSchema.parse(event)).not.toThrow()
  })

  it('emits single stub event when scans is empty, using top-level status', () => {
    const events = transformTracking(makeTracking({ scans: [], status: 'delivered' }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('DELIVERED')
    expect(events[0].trackingNumber).toBe('AWB123456')
  })

  it('falls back to awb when tracking_number is absent', () => {
    const events = transformTracking({
      awb: 'AWB999',
      status: 'booked',
      scans: [],
    })
    expect(events[0].trackingNumber).toBe('AWB999')
  })

  it('uses events array when scans is absent', () => {
    const tracking: ShypliteTracking = {
      tracking_number: 'AWB111',
      status: 'pending',
      events: [makeEvent({ status: 'delivered' })],
    }
    const events = transformTracking(tracking)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('DELIVERED')
  })

  it('maps status variants correctly', () => {
    const cases: Array<[string | null | undefined, string]> = [
      ['delivered', 'DELIVERED'],
      ['out for delivery', 'OUT_FOR_DELIVERY'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['in transit', 'IN_TRANSIT'],
      ['picked up', 'IN_TRANSIT'],
      ['pickup done', 'IN_TRANSIT'],
      ['booked', 'PRE_TRANSIT'],
      ['shipment created', 'PRE_TRANSIT'],
      ['rto initiated', 'RETURN_TO_SENDER'],
      ['return to origin', 'RETURN_TO_SENDER'],
      ['cancelled', 'FAILURE'],
      ['ndr', 'FAILURE'],
      ['lost', 'FAILURE'],
      [null, 'UNKNOWN'],
      [undefined, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const tracking = makeTracking({ scans: [], status: status ?? undefined })
      expect(transformTracking(tracking)[0].status).toBe(expected)
    }
  })

  it('omits location when city and state are absent', () => {
    const event = transformTracking(
      makeTracking({ scans: [makeEvent({ city: null, state: null })] }),
    )[0]
    expect(event.location).toBeUndefined()
  })

  it('falls back to remark when description is absent', () => {
    const event = transformTracking(
      makeTracking({ scans: [makeEvent({ description: null, remark: 'Delivered at door' })] }),
    )[0]
    expect(event.description).toBe('Delivered at door')
  })
})
