import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  mapStatusCode,
} from '../../../../../../../src/verticals/logistics/adapters/xpressbees/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { docTrack } from '../fixtures'

describe('xpressbees transformTracking', () => {
  it('maps each documented history row to a valid TrackingEvent', () => {
    const out = transformTracking(docTrack.data, '14344940342223').map((e) =>
      TrackingEventSchema.parse(e),
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      id: '14344940342223:2024-02-10 00:40:PP',
      shipmentId: '9590285',
      trackingNumber: '14344940342223',
      carrierId: 'xpressbees',
      status: 'PRE_TRANSIT',
      description: 'Out For Pickup',
    })
    expect(out[1]?.description).toBe('Data Received')
  })

  it('does not invent a time zone for event_time, and keeps it on metadata', () => {
    const [e] = transformTracking(docTrack.data, '14344940342223')
    expect(e?.occurredAt).toBeUndefined()
    expect(e?.metadata?.['event_time']).toBe('2024-02-10 00:40')
    expect(e?.location).toBeUndefined()
  })

  it('gives repeated events distinct, stable ids', () => {
    const row = docTrack.data.history[0]!
    const data = { ...docTrack.data, history: [row, row] }
    const ids = transformTracking(data, 'A').map((e) => e.id)
    expect(ids).toEqual(['A:2024-02-10 00:40:PP', 'A:2024-02-10 00:40:PP:2'])
    expect(transformTracking(data, 'A').map((e) => e.id)).toEqual(ids)
  })

  it('emits no event for an empty history (current status is not an event)', () => {
    expect(transformTracking({ ...docTrack.data, history: [] }, 'A')).toEqual([])
  })

  it('maps the documented status codes', () => {
    const cases: Array<[string, string]> = [
      ['PP', 'PRE_TRANSIT'],
      ['IT', 'IN_TRANSIT'],
      ['EX', 'FAILURE'],
      ['FD', 'OUT_FOR_DELIVERY'],
      ['DL', 'DELIVERED'],
      ['RT', 'RETURN_TO_SENDER'],
      ['RT-IT', 'RETURN_TO_SENDER'],
      ['RT-DL', 'RETURN_TO_SENDER'],
      ['ZZ', 'UNKNOWN'],
    ]
    for (const [code, expected] of cases) expect(mapStatusCode(code)).toBe(expected)
    expect(mapStatusCode(null)).toBe('UNKNOWN')
  })
})
