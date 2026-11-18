/**
 * Karrio trackers flattened into events. Fixtures follow the documented
 * TrackingStatus / TrackingEvent response (https://docs.karrio.io/reference/openapi,
 * "Retrieves a package tracker"), plus the event `timestamp` and `status` of
 * the current schema (karrioapi/karrio schemas/openapi.yml, 2026.1.32).
 */
import { describe, it, expect } from 'vitest'
import {
  transformTracker,
  type KarrioTracker,
  type KarrioTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/karrio/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

/** The 2024.12.6 documented event: date, description, location, code, time, lat/long. */
function makeEvent(overrides: Partial<KarrioTrackingEvent> = {}): KarrioTrackingEvent {
  return {
    date: '2024-03-02',
    description: 'Departed facility',
    location: 'Montreal, QC, CA',
    code: 'DF',
    time: '10:15 AM',
    latitude: 45.5,
    longitude: -73.56,
    ...overrides,
  }
}

function makeRaw(overrides: Partial<KarrioTracker> = {}): KarrioTracker {
  return {
    id: 'trk_1f2e3d',
    carrier_name: 'canadapost',
    carrier_id: 'canadapost-main',
    tracking_number: '1Z999AA10123456784',
    events: [makeEvent()],
    ...overrides,
  }
}

const parseAll = (raw: KarrioTracker) =>
  transformTracker(raw).map((e) => TrackingEventSchema.parse(e))

describe('karrio transformTracker', () => {
  it('parses each event with TrackingEventSchema', () => {
    expect(parseAll(makeRaw())).toHaveLength(1)
  })

  it('one canonical event per documented event', () => {
    const raw = makeRaw({
      events: [makeEvent(), makeEvent({ description: 'Arrived', time: '08:00 AM' })],
    })
    expect(parseAll(raw)).toHaveLength(2)
  })

  it('a tracker with no events yields none: its status is not an event', () => {
    expect(transformTracker(makeRaw({ events: [] }))).toEqual([])
    expect(transformTracker(makeRaw({ events: null }))).toEqual([])
  })

  it('maps tracking_number and carrier_id', () => {
    const [e] = parseAll(makeRaw())
    expect(e!.trackingNumber).toBe('1Z999AA10123456784')
    expect(e!.carrierId).toBe('canadapost-main')
    expect(e!.description).toBe('Departed facility')
  })

  it('ids are deterministic, distinct per event, and independent of list position', () => {
    const a = makeEvent()
    const b = makeEvent({ description: 'Arrived', time: '08:00 AM' })
    const [ia, ib] = parseAll(makeRaw({ events: [a, b] })).map((e) => e.id)
    const [jb, ja] = parseAll(makeRaw({ events: [b, a] })).map((e) => e.id)
    expect(ia).toBeTruthy()
    expect(ia).not.toBe(ib)
    expect(ja).toBe(ia)
    expect(jb).toBe(ib)
    expect(ia!.startsWith('canadapost:1Z999AA10123456784:')).toBe(true)
  })

  it('events that differ only in description get different ids', () => {
    const a = makeEvent()
    const b = makeEvent({ description: 'Held at customs' })
    const [ia, ib] = parseAll(makeRaw({ events: [a, b] })).map((e) => e.id)
    expect(ia).not.toBe(ib)
  })

  it('the same event on another tracking number gets another id', () => {
    const [x] = parseAll(makeRaw())
    const [y] = parseAll(makeRaw({ tracking_number: 'OTHER' }))
    expect(x!.id).not.toBe(y!.id)
  })

  it('occurredAt comes from the ISO 8601 timestamp', () => {
    const [e] = parseAll(
      makeRaw({ events: [makeEvent({ timestamp: '2024-03-02T15:15:00.000Z' })] }),
    )
    expect(e!.occurredAt).toEqual(new Date('2024-03-02T15:15:00.000Z'))
  })

  it('zoneless date + "HH:MM AM/PM" time is not turned into an instant', () => {
    const [e] = parseAll(makeRaw())
    expect(e!.occurredAt).toBeUndefined()
    expect(e!.metadata).toEqual(expect.objectContaining({ date: '2024-03-02', time: '10:15 AM' }))
    const [dateOnly] = parseAll(makeRaw({ events: [makeEvent({ time: null })] }))
    expect(dateOnly!.occurredAt).toBeUndefined()
  })

  it('status comes from the event status only, never the carrier code or tracker status', () => {
    const [none] = parseAll(makeRaw({ events: [makeEvent({ code: 'delivered' })] }))
    expect(none!.status).toBeUndefined()
    const cases: Array<[string, string]> = [
      ['pending', 'PRE_TRANSIT'],
      ['picked_up', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['delivery_delayed', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['ready_for_pickup', 'AVAILABLE_FOR_PICKUP'],
      ['return_to_sender', 'RETURN_TO_SENDER'],
      ['delivery_failed', 'FAILURE'],
      ['on_hold', 'UNKNOWN'],
      ['cancelled', 'UNKNOWN'],
      ['unknown', 'UNKNOWN'],
    ]
    for (const [status, want] of cases) {
      const [e] = parseAll(makeRaw({ events: [makeEvent({ status })] }))
      expect(e!.status, status).toBe(want)
    }
  })

  it('keeps the free-form location in metadata instead of guessing address parts', () => {
    const [e] = parseAll(makeRaw())
    expect(e!.location).toBeUndefined()
    expect(e!.metadata).toEqual(
      expect.objectContaining({
        location: 'Montreal, QC, CA',
        latitude: 45.5,
        longitude: -73.56,
        code: 'DF',
        trackerId: 'trk_1f2e3d',
        carrierName: 'canadapost',
      }),
    )
  })
})
