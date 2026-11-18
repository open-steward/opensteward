import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  mapScanStatus,
  type IthinkLogisticsTrackingRaw,
} from '../../../../../../../src/verticals/logistics/adapters/ithink-logistics/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { docTrackRow } from '../fixtures'

const raw = () => docTrackRow() as IthinkLogisticsTrackingRaw

describe('ithink-logistics transformTracking (documented order/track.json row)', () => {
  it('emits one schema-valid event per scan_details entry, in order', () => {
    const events = transformTracking(raw(), '1369010033902')
    events.forEach((e) => TrackingEventSchema.parse(e))
    expect(events.map((e) => [e.id, e.status, e.description])).toEqual([
      ['1369010033902:0', 'PRE_TRANSIT', 'Consignment Manifested'],
      ['1369010033902:1', 'IN_TRANSIT', 'Shipment Picked Up from Client Location'],
      ['1369010033902:2', 'FAILURE', 'CONSIGNEE NOT AVAILABLE'],
    ])
    expect(events.every((e) => e.trackingNumber === '1369010033902')).toBe(true)
  })

  it('does not invent occurredAt from a zone-less scan_date_time', () => {
    const [e] = transformTracking(raw(), '1369010033902')
    expect(e!.occurredAt).toBeUndefined()
    expect(e!.metadata?.['scan_date_time']).toBe('2017-06-07 14:05:57')
  })

  it('emits no event for a current status alone', () => {
    expect(transformTracking({ ...raw(), scan_details: [] }, '1')).toEqual([])
  })

  it('maps the documented status table', () => {
    const cases: Array<[string, string]> = [
      ['Manifested', 'PRE_TRANSIT'],
      ['Picked Up', 'IN_TRANSIT'],
      ['Out For Delivery', 'OUT_FOR_DELIVERY'],
      ['Delivered', 'DELIVERED'],
      ['Undelivered', 'FAILURE'],
      ['RTO In Transit', 'RETURN_TO_SENDER'],
      ['Cancelled', 'UNKNOWN'],
      ['whatever', 'UNKNOWN'],
    ]
    for (const [s, want] of cases) expect(mapScanStatus(s)).toBe(want)
  })
})
