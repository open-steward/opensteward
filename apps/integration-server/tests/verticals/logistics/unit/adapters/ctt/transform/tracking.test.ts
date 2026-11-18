import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  mapTrackingStatus,
} from '../../../../../../../src/verticals/logistics/adapters/ctt/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { TRACKING_REPLY } from '../fixtures'

describe('CTT transformTracking', () => {
  it('emits one canonical event per documented Statuslist entry', () => {
    const events = transformTracking(TRACKING_REPLY).map((e) => TrackingEventSchema.parse(e))
    expect(events.map((e) => e.id)).toEqual([
      'ORDER-1:10:2026-09-22T08:00:00Z',
      'ORDER-1:25:2026-09-22T15:30:00Z',
      'ORDER-1:99:2026-09-23T11:45:00Z',
    ])
    expect(events.map((e) => e.status)).toEqual(['PRE_TRANSIT', 'IN_TRANSIT', 'DELIVERED'])
    expect(events[2]).toMatchObject({
      trackingNumber: 'EA123456789PT',
      description: 'Delivered',
      occurredAt: new Date('2026-09-23T11:45:00Z'),
    })
  })

  it('reads sublists given as arrays too', () => {
    const shipment = Object.values(TRACKING_REPLY.Shipments as Record<string, never>)[0]!
    const raw = {
      Shipments: [
        {
          ...(shipment as object),
          Statuslist: Object.values((shipment as { Statuslist: object }).Statuslist),
        },
      ],
    }
    expect(transformTracking(raw as never)).toHaveLength(3)
  })

  it('invents no event for a shipment without status lines', () => {
    expect(
      transformTracking({ Shipments: { a: { ClientReferenceCode: 'a', Statuslist: {} } } }),
    ).toEqual([])
    expect(transformTracking({})).toEqual([])
  })

  it('maps the documented status codes', () => {
    const cases: Array<[number, string]> = [
      [10, 'PRE_TRANSIT'],
      [20, 'PRE_TRANSIT'],
      [23, 'PRE_TRANSIT'],
      [25, 'IN_TRANSIT'],
      [21, 'FAILURE'],
      [31, 'FAILURE'],
      [96, 'FAILURE'],
      [32, 'DELIVERED'],
      [94, 'DELIVERED'],
      [99, 'DELIVERED'],
      [95, 'AVAILABLE_FOR_PICKUP'],
      [30, 'UNKNOWN'],
      [42, 'UNKNOWN'],
      [97, 'UNKNOWN'],
    ]
    for (const [code, want] of cases) expect([code, mapTrackingStatus(code)]).toEqual([code, want])
  })
})
