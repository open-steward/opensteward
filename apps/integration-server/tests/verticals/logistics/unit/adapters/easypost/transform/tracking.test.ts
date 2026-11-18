import { describe, it, expect } from 'vitest'
import {
  transformTracker,
  type EasyPostTracker,
  type EasyPostTrackingDetail,
} from '../../../../../../../src/verticals/logistics/adapters/easypost/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

/**
 * Tracking-event ids.
 *
 * A TrackingDetail has no id of its own (docs.easypost.com/docs/trackers), and
 * the transform used to emit events with none. The sync worker and the cache
 * key every row by `id`, so a sync of tracking events failed: two pages of
 * id-less events compared equal ("the adapter is ignoring the `page`
 * parameter"), and the resource store's NOT NULL `resource_id` refused even a
 * single page. Each event is now named by its tracker and its position.
 *
 * Positions are stable because docs.easypost.com/guides/tracking-guide says:
 * "Oldest events appear first, and new events are appended as they are
 * received. Because carriers occasionally send updates out of order, use the
 * top-level status field for any primary workflow logic." Read together, the
 * two sentences put the array in arrival order, not `datetime` order: a scan
 * that arrives late is appended even when its timestamp is earlier.
 */

// ─── Fixtures: the Tracker sample on docs.easypost.com/docs/trackers, copied
// verbatim (id, tracking_code, timestamps, both tracking_details, run oldest
// first). Any detail a test adds beyond these two is synthetic and says so. ──

const DOCS_DETAILS: EasyPostTrackingDetail[] = [
  {
    object: 'TrackingDetail',
    message: 'Pre-Shipment Info Sent to USPS',
    description: '',
    status: 'pre_transit',
    status_detail: 'status_update',
    datetime: '2025-04-09T20:40:17Z',
    source: 'USPS',
    carrier_code: '',
    tracking_location: {
      object: 'TrackingLocation',
      city: null,
      state: null,
      country: null,
      zip: null,
    },
    est_delivery_date: null,
  },
  {
    object: 'TrackingDetail',
    message: 'Shipping Label Created',
    description: '',
    status: 'pre_transit',
    status_detail: 'status_update',
    datetime: '2025-04-10T09:17:17Z',
    source: 'USPS',
    carrier_code: '',
    tracking_location: {
      object: 'TrackingLocation',
      city: 'HOUSTON',
      state: 'TX',
      country: null,
      zip: '77063',
    },
    est_delivery_date: null,
  },
]

/** The first docs detail, with a test's own changes on top. */
function detail(overrides: Partial<EasyPostTrackingDetail> = {}): EasyPostTrackingDetail {
  return { ...DOCS_DETAILS[0]!, ...overrides }
}

function tracker(overrides: Partial<EasyPostTracker> = {}): EasyPostTracker {
  return {
    id: 'trk_9135862729734d96ad2f9ed0f0565a27',
    object: 'Tracker',
    mode: 'test',
    tracking_code: 'EZ1000000001',
    status: 'pre_transit',
    status_detail: 'status_update',
    created_at: '2025-05-09T20:40:17Z',
    updated_at: '2025-05-09T20:40:17Z',
    signed_by: null,
    weight: null,
    est_delivery_date: '2025-05-09T20:40:17Z',
    shipment_id: null,
    carrier: 'USPS',
    tracking_details: [...DOCS_DETAILS],
    fees: [],
    carrier_detail: {
      object: 'CarrierDetail',
      service: 'First-Class Package Service',
      container_type: null,
      est_delivery_date_local: null,
      est_delivery_time_local: null,
      origin_location: 'HOUSTON TX, 77001',
      origin_tracking_location: {
        object: 'TrackingLocation',
        city: 'HOUSTON',
        state: 'TX',
        country: null,
        zip: '77063',
      },
      destination_location: 'CHARLESTON SC, 29401',
      destination_tracking_location: null,
      guaranteed_delivery_date: null,
      alternate_identifier: null,
      initial_delivery_attempt: null,
    },
    public_url: 'https://track.easypost.com/djE6dHJrXzkxMzU4NjI3Mjk3MzRkOTZhZDJmOWVkMGYwNTY1YTI3',
    ...overrides,
  }
}

describe('transformTracker names every event', () => {
  it('names each detail by its tracker and position', () => {
    const events = transformTracker(tracker())
    expect(events.map((e) => e.id)).toEqual([
      'trk_9135862729734d96ad2f9ed0f0565a27-0',
      'trk_9135862729734d96ad2f9ed0f0565a27-1',
    ])
    for (const e of events) expect(() => TrackingEventSchema.parse(e)).not.toThrow()
  })

  it('keeps the earlier ids when a new scan is appended', () => {
    const before = transformTracker(tracker())
    const after = transformTracker(
      tracker({
        tracking_details: [
          ...DOCS_DETAILS,
          // Synthetic third scan: not in the docs sample.
          detail({
            message: 'Arrived at facility',
            status: 'in_transit',
            datetime: '2025-04-11T08:00:00Z',
          }),
        ],
      }),
    )
    expect(after.slice(0, 2).map((e) => e.id)).toEqual(before.map((e) => e.id))
    expect(after[2]?.id).toBe('trk_9135862729734d96ad2f9ed0f0565a27-2')
  })

  it('keeps positions by arrival when a late scan carries an earlier datetime', () => {
    // Arrival order rests on the guide's prose, quoted at the top of this file,
    // and on nothing in its sample. The two datetimes below come from that
    // sample only because they sort in the opposite order to arrival: OUT FOR
    // DELIVERY at 2014-11-24T08:10:00Z, then DELIVERED at 2014-11-19T10:51:54Z.
    // In the sample, DELIVERED is also two days earlier than the first event
    // (2014-11-21T14:24:00Z), so it reads as a typo there, not as an example of
    // a late scan. Sorting by datetime would move DELIVERED to the front and
    // give OUT FOR DELIVERY a different id.
    const outForDelivery = detail({
      message: 'OUT FOR DELIVERY',
      status: 'out_for_delivery',
      datetime: '2014-11-24T08:10:00Z',
    })
    const delivered = detail({
      message: 'DELIVERED',
      status: 'delivered',
      datetime: '2014-11-19T10:51:54Z',
    })
    const before = transformTracker(tracker({ tracking_details: [outForDelivery] }))
    const after = transformTracker(tracker({ tracking_details: [outForDelivery, delivered] }))

    expect(after.map((e) => [e.id, e.description])).toEqual([
      ['trk_9135862729734d96ad2f9ed0f0565a27-0', 'OUT FOR DELIVERY'],
      ['trk_9135862729734d96ad2f9ed0f0565a27-1', 'DELIVERED'],
    ])
    expect(after[0]?.id).toBe(before[0]?.id)
  })

  it('gives the summary of a tracker with no details the first event’s id', () => {
    // So the first real scan replaces it in the cache instead of sitting beside it.
    const summary = transformTracker(tracker({ tracking_details: [] }))
    const scanned = transformTracker(tracker({ tracking_details: [detail()] }))
    expect(summary).toHaveLength(1)
    expect(summary[0]?.id).toBe('trk_9135862729734d96ad2f9ed0f0565a27-0')
    expect(scanned[0]?.id).toBe(summary[0]?.id)
    expect(() => TrackingEventSchema.parse(summary[0])).not.toThrow()
  })

  it('never gives two trackers’ events the same id', () => {
    // Synthetic tracker ids: two distinct trackers, nothing more.
    const a = transformTracker(tracker({ id: 'trk_a' }))
    const b = transformTracker(tracker({ id: 'trk_b' }))
    const all = [...a, ...b].map((e) => e.id)
    expect(new Set(all).size).toBe(all.length)
  })
})
