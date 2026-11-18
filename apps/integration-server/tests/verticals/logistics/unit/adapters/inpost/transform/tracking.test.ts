import { describe, it, expect } from 'vitest'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { transformTrackingEvents } from '../../../../../../../src/verticals/logistics/adapters/inpost/transform/tracking'
import { tracking } from '../fixtures'

describe('inpost transformTrackingEvents (GET /v1/tracking/:tracking_number)', () => {
  it('emits one event per tracking_details entry, parsed by the canonical schema', () => {
    const events = transformTrackingEvents(tracking()).map((e) => TrackingEventSchema.parse(e))
    expect(events.map((e) => e.status)).toEqual([
      'DELIVERED',
      'AVAILABLE_FOR_PICKUP',
      'OUT_FOR_DELIVERY',
    ])
    expect(events[0]).toMatchObject({
      id: '632085946340007012341234:2023-12-18T11:20:06.000+01:00:delivered',
      trackingNumber: '632085946340007012341234',
      carrierId: 'inpost',
    })
    expect(events[0].occurredAt?.toISOString()).toBe('2023-12-18T10:20:06.000Z')
  })

  it('gives every event a distinct, deterministic id', () => {
    const a = transformTrackingEvents(tracking()).map((e) => e.id)
    const b = transformTrackingEvents(tracking()).map((e) => e.id)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
  })

  it('maps an undocumented status name to UNKNOWN', () => {
    const [e] = transformTrackingEvents(
      tracking({ tracking_details: [{ status: 'zz_new', datetime: '2023-12-18T11:20:06Z' }] }),
    )
    expect(TrackingEventSchema.parse(e).status).toBe('UNKNOWN')
  })

  it('invents no event from the current status when there is no history', () => {
    expect(transformTrackingEvents(tracking({ tracking_details: [] }))).toEqual([])
  })
})
