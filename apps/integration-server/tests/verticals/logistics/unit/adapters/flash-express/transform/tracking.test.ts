import { describe, it, expect } from 'vitest'
import { transformTracking } from '../../../../../../../src/verticals/logistics/adapters/flash-express/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { docRoutes } from '../fixtures'

describe('flash-express transformTracking', () => {
  it('maps every documented route to one canonical event', () => {
    const raw = docRoutes()
    const events = transformTracking(raw).map((e) => TrackingEventSchema.parse(e))
    expect(events).toHaveLength(4)
    expect(events[0]).toEqual({
      id: 'TH0112XXXXXX:1523357001:DELIVERY_CONFIRM',
      trackingNumber: 'TH0112XXXXXX',
      carrierId: 'flash-express',
      // Status follows routes.state ("route status parcel state"). The docs'
      // own example gives this DELIVERY_CONFIRM route state 1 ("Picked up"),
      // so IN_TRANSIT here pins the table's mapping, not the action name.
      status: 'IN_TRANSIT',
      description: 'พัสดุของคุณถูกเซ็นรับแล้ว เซ็นรับโดย TH0112XXXXXX',
      occurredAt: new Date(1523357001 * 1000),
      metadata: raw.routes![0],
    })
  })

  it('reads routedAt as Unix seconds in UTC', () => {
    const [, , , received] = transformTracking(docRoutes())
    expect(received!.occurredAt!.toISOString()).toBe('2018-04-10T10:27:09.000Z')
  })

  it('builds the same deterministic id on every read, one per route', () => {
    const a = transformTracking(docRoutes()).map((e) => e.id)
    const b = transformTracking(docRoutes()).map((e) => e.id)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(4)
  })

  it('maps each documented parcel state code', () => {
    const cases: [number | null, string][] = [
      [1, 'IN_TRANSIT'],
      [2, 'IN_TRANSIT'],
      [3, 'OUT_FOR_DELIVERY'],
      [4, 'FAILURE'],
      [5, 'DELIVERED'],
      [6, 'FAILURE'],
      [7, 'RETURN_TO_SENDER'],
      [8, 'FAILURE'],
      [9, 'FAILURE'],
      [42, 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [state, expected] of cases) {
      const raw = docRoutes()
      raw.routes = [{ ...raw.routes![0]!, state }]
      const [e] = transformTracking(raw)
      expect(TrackingEventSchema.parse(e).status, `state ${String(state)}`).toBe(expected)
    }
  })

  it('returns no events, not a synthetic one, when the parcel has no routes', () => {
    expect(transformTracking({ ...docRoutes(), routes: [] })).toEqual([])
    expect(transformTracking({ ...docRoutes(), routes: null })).toEqual([])
  })

  it('omits the description when the route message is empty', () => {
    const raw = docRoutes()
    raw.routes![0]!.message = ''
    const [first] = transformTracking(raw).map((e) => TrackingEventSchema.parse(e))
    expect(first!.description).toBeUndefined()
  })
})
