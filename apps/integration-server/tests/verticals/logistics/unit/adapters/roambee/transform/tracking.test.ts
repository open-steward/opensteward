/**
 * POST /shipment/alerts ("Get Alert for Shipment"), https://docs.decklar.com/.
 * The fixture is the documented 200 example (its `data` objects trimmed).
 */
import { describe, it, expect } from 'vitest'
import {
  transformAlerts,
  type RoambeeAlert,
} from '../../../../../../../src/verticals/logistics/adapters/roambee/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

const SID = '723c09c3-fc17-4dad-9795-7214e4f0e5f6'

const DOCUMENTED: RoambeeAlert[] = [
  {
    event: 'SHIPMENTSTART',
    short_message: 'Shipment has departed its origin',
    reported_on: 1613062538,
    address: 'Vlastimila Pecha 10, 627 00 Brno-Černovice, Czechia',
    data: { radius: 9457.958305140317, scheduled: 1613030400000, actual: 1613062539000 },
  },
  {
    event: 'MOVING',
    short_message: '359804085134593 is moving',
    reported_on: 1613062539,
    address: 'Senftenberger Str. 29, 01998 Schipkau, Germany',
    data: { mph: 27.2762 },
  },
]

describe('Roambee transformAlerts', () => {
  it('parses every documented alert with TrackingEventSchema', () => {
    const events = transformAlerts(SID, DOCUMENTED)
    expect(events).toHaveLength(2)
    for (const e of events) TrackingEventSchema.parse(e)
  })

  it('maps the documented fields', () => {
    const [start, moving] = transformAlerts(SID, DOCUMENTED)
    expect(start).toMatchObject({
      id: `${SID}:1613062538:SHIPMENTSTART`,
      shipmentId: SID,
      status: 'IN_TRANSIT',
      description: 'Shipment has departed its origin',
      location: { street1: 'Vlastimila Pecha 10, 627 00 Brno-Černovice, Czechia' },
    })
    // reported_on is epoch seconds: the example's data.actual is the same instant in ms.
    expect(start!.occurredAt?.getTime()).toBe(1613062538 * 1000)
    expect(moving!.status).toBe('IN_TRANSIT')
    expect(moving!.id).toBe(`${SID}:1613062539:MOVING`)
    expect(start!.metadata).toBe(DOCUMENTED[0])
  })

  it('maps an undocumented event to UNKNOWN', () => {
    const [e] = transformAlerts(SID, [{ event: 'SOMETHINGELSE', reported_on: 1 }])
    expect(e!.status).toBe('UNKNOWN')
  })

  it('never invents occurredAt or a location', () => {
    const [e] = transformAlerts(SID, [{ event: 'MOVING' }])
    expect(e!.occurredAt).toBeUndefined()
    expect(e!.location).toBeUndefined()
    expect(e!.trackingNumber).toBeUndefined()
    TrackingEventSchema.parse(e)
  })

  it('keeps ids unique and stable when an alert repeats', () => {
    const twice = [DOCUMENTED[1]!, DOCUMENTED[1]!]
    const ids = transformAlerts(SID, twice).map((e) => e.id)
    expect(ids).toEqual([`${SID}:1613062539:MOVING`, `${SID}:1613062539:MOVING#1`])
    expect(transformAlerts(SID, twice).map((e) => e.id)).toEqual(ids)
  })
})
