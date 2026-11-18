import { describe, it, expect } from 'vitest'
import { transformTracking } from '../../../../../../../src/verticals/logistics/adapters/mylerz/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { docStatusLog, docTracking } from '../fixtures'

describe('transformTracking (mylerz)', () => {
  it('turns each PackageStatusLog entry into an event that parses', () => {
    const events = transformTracking(docTracking(), '12345678901234')
    expect(events).toHaveLength(2)
    const first = TrackingEventSchema.parse(events[0])
    expect(first).toEqual({
      id: '12345678901234:1:2026-09-24T16:23:33.0342167+03:00',
      trackingNumber: '12345678901234',
      carrierId: 'mylerz',
      status: 'UNKNOWN',
      description: 'sample string 3',
      occurredAt: new Date('2026-09-24T13:23:33.034Z'),
      metadata: docStatusLog(1),
    })
    expect(TrackingEventSchema.parse(events[1]).occurredAt).toEqual(
      new Date('2026-09-25T07:00:00Z'),
    )
  })

  it('gives each event a distinct, deterministic id', () => {
    const a = transformTracking(docTracking(), 'X').map((e) => e.id)
    const b = transformTracking(docTracking(), 'X').map((e) => e.id)
    expect(a).toEqual(b)
    expect(new Set(a).size).toBe(a.length)
  })

  it('keeps ids distinct when entries share a StatusId and have no ChangedDate', () => {
    const log = [
      { ...docStatusLog(1), ChangedDate: null },
      { ...docStatusLog(1), ChangedDate: null },
      { ...docStatusLog(1), ChangedDate: null },
    ]
    const ids = transformTracking({ PackageStatusLog: log }, 'X').map(
      (e) => TrackingEventSchema.parse(e).id,
    )
    expect(ids).toEqual(['X:1:', 'X:1:#2', 'X:1:#3'])
  })

  it('returns no events for an empty log, never one built from the current status', () => {
    expect(transformTracking(docTracking([]), 'X')).toEqual([])
    expect(transformTracking({ PackageStatusLog: null }, 'X')).toEqual([])
  })

  it('leaves occurredAt out when ChangedDate is missing', () => {
    const [evt] = transformTracking(
      { PackageStatusLog: [{ ...docStatusLog(1), ChangedDate: null }] },
      'X',
    )
    expect(TrackingEventSchema.parse(evt).occurredAt).toBeUndefined()
  })
})
