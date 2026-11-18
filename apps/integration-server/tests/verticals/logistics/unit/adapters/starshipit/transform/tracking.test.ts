import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type StarshipitTracking,
  type StarshipitTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/starshipit/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<StarshipitTrackingEvent> = {}): StarshipitTrackingEvent {
  return {
    description: 'Parcel received',
    status: 'pre_transit',
    status_code: null,
    datetime: '2024-03-01T08:00:00Z',
    suburb: 'Melbourne',
    state: 'VIC',
    postcode: '3000',
    country: 'AU',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<StarshipitTracking> = {}): StarshipitTracking {
  return {
    tracking_number: 'AP123456789AU',
    carrier_name: 'Australia Post',
    carrier_code: 'auspost',
    order_id: 55001,
    status: 'shipped',
    events: [
      makeEvent(),
      makeEvent({
        status: 'in_transit',
        description: 'In transit',
        suburb: 'Sydney',
        state: 'NSW',
      }),
    ],
    ...overrides,
  }
}

describe('starshipit transformTracking', () => {
  it('produces one event per events entry', () => {
    expect(transformTracking(makeRaw())).toHaveLength(2)
  })

  it('maps trackingNumber from tracking_number', () => {
    const events = transformTracking(makeRaw())
    expect(events[0].trackingNumber).toBe('AP123456789AU')
  })

  it('maps shipmentId from order_id (numeric → string)', () => {
    const events = transformTracking(makeRaw())
    expect(events[0].shipmentId).toBe('55001')
  })

  it('maps carrierId from carrier_code', () => {
    const events = transformTracking(makeRaw())
    expect(events[0].carrierId).toBe('auspost')
  })

  it('maps status PRE_TRANSIT', () => {
    const events = transformTracking(makeRaw())
    expect(events[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status IN_TRANSIT', () => {
    const events = transformTracking(makeRaw())
    expect(events[1].status).toBe('IN_TRANSIT')
  })

  it('maps status OUT_FOR_DELIVERY', () => {
    const events = transformTracking(
      makeRaw({ events: [makeEvent({ status: 'out_for_delivery' })] }),
    )
    expect(events[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps status DELIVERED', () => {
    const events = transformTracking(makeRaw({ events: [makeEvent({ status: 'delivered' })] }))
    expect(events[0].status).toBe('DELIVERED')
  })

  it('maps status AVAILABLE_FOR_PICKUP', () => {
    const events = transformTracking(
      makeRaw({ events: [makeEvent({ status: 'available_for_pickup' })] }),
    )
    expect(events[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps status RETURN_TO_SENDER', () => {
    const events = transformTracking(makeRaw({ events: [makeEvent({ status: 'returned' })] }))
    expect(events[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps status FAILURE', () => {
    const events = transformTracking(makeRaw({ events: [makeEvent({ status: 'failed' })] }))
    expect(events[0].status).toBe('FAILURE')
  })

  it('maps description', () => {
    const events = transformTracking(makeRaw())
    expect(events[0].description).toBe('Parcel received')
  })

  it('maps location from suburb/state/postcode/country', () => {
    const events = transformTracking(makeRaw())
    expect(events[0].location?.city).toBe('Melbourne')
    expect(events[0].location?.state).toBe('VIC')
    expect(events[0].location?.postalCode).toBe('3000')
    expect(events[0].location?.country).toBe('AU')
  })

  it('maps occurredAt from datetime', () => {
    const events = transformTracking(makeRaw())
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('falls back occurredAt to date field when datetime is null', () => {
    const events = transformTracking(
      makeRaw({ events: [makeEvent({ datetime: null, date: '2024-03-01' })] }),
    )
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('synthesises a fallback event when events array is empty', () => {
    const events = transformTracking(makeRaw({ events: [] }))
    expect(events).toHaveLength(1)
    // top-level status 'shipped' → IN_TRANSIT
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('also falls back to tracking_events when events is null', () => {
    const raw: StarshipitTracking = {
      tracking_number: 'AP-999',
      carrier_code: 'auspost',
      tracking_events: [makeEvent({ status: 'delivered' })],
    }
    const events = transformTracking(raw)
    expect(events[0].status).toBe('DELIVERED')
  })

  it('preserves metadata on each event', () => {
    const events = transformTracking(makeRaw())
    for (const e of events) {
      expect(e.metadata).toBeDefined()
    }
  })

  it('produces schema-valid TrackingEvent objects', () => {
    const events = transformTracking(makeRaw())
    for (const e of events) {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    }
  })
})
