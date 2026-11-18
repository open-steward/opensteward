import { describe, it, expect } from 'vitest'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import {
  parseItemTracking,
  transformTrackingEvents,
} from '../../../../../../../src/verticals/logistics/adapters/bpost/transform/tracking'
import { parseXml } from '../../../../../../../src/verticals/logistics/adapters/bpost/xml'
import { ITEM_CODE, ITEM_TRACKING } from '../fixtures'

const events = (xml: string) =>
  transformTrackingEvents(parseItemTracking(parseXml(xml))).map((e) => TrackingEventSchema.parse(e))

function withStates(states: Array<[string, string, string]>): string {
  return `<itemTracking xmlns="http://schema.post.be/tracking/v1/"><itemCode>${ITEM_CODE}</itemCode>${states
    .map(
      ([time, code, desc]) =>
        `<stateInfo><time>${time}</time><stateCode>${code}</stateCode><stateDescription>${desc}</stateDescription></stateInfo>`,
    )
    .join('')}</itemTracking>`
}

describe('bpost transformTrackingEvents (GET /item/{item_nb}/trackingInfo)', () => {
  it('emits one event per documented stateInfo, in order', () => {
    const out = events(ITEM_TRACKING)
    expect(out.map((e) => [e.status, e.description])).toEqual([
      ['IN_TRANSIT', 'Sorted - sorted_out'],
      ['OUT_FOR_DELIVERY', 'BoundToRound - out_for_distribution'],
      ['DELIVERED', 'DistributedNormally - regular'],
    ])
    expect(out.every((e) => e.trackingNumber === ITEM_CODE && e.carrierId === 'bpost')).toBe(true)
    expect(out[2]?.occurredAt?.toISOString()).toBe('2012-11-23T08:31:07.427Z')
  })

  it('builds stable, distinct ids from the item code and each state', () => {
    const first = events(ITEM_TRACKING).map((e) => e.id)
    expect(first).toEqual([
      `${ITEM_CODE}:2012-11-22T23:19:29+01:00:T00`,
      `${ITEM_CODE}:2012-11-23T07:11:18.923+01:00:L00`,
      `${ITEM_CODE}:2012-11-23T09:31:07.427+01:00:U01`,
    ])
    expect(events(ITEM_TRACKING).map((e) => e.id)).toEqual(first)
  })

  it('invents no event when bpost lists no state', () => {
    expect(events(withStates([]))).toEqual([])
  })

  it.each([
    ['Z01', 'Announcement received', 'PRE_TRANSIT'],
    ['A01', 'HandedIn - back_office', 'IN_TRANSIT'],
    ['A04', 'HandedIn - drop_off_customer', 'IN_TRANSIT'],
    ['N74', 'AwaitingPickupByClient - deposit_special_package', 'AVAILABLE_FOR_PICKUP'],
    ['U03', 'DistributedNormally - at_neighbours', 'DELIVERED'],
    ['S00', 'DistributedAfterBTS - regular', 'RETURN_TO_SENDER'],
    ['B11', 'ItemUnclaimed - item_unclaimed', 'FAILURE'],
    ['T03', 'DistributedToShopNormally - regular', 'UNKNOWN'],
    ['N07', 'RoutedToPickupPoint - addressee_absent', 'UNKNOWN'],
  ])('maps status code %s (%s) to %s', (code, desc, expected) => {
    const [e] = events(withStates([['2012-11-23T09:31:07+01:00', code, desc]]))
    expect(e?.status).toBe(expected)
    expect(e?.description).toBe(desc)
  })

  it('reads a state code case-insensitively', () => {
    const [e] = events(
      withStates([['2012-11-23T09:31:07+01:00', 'u01', 'DistributedNormally - regular']]),
    )
    expect(e?.status).toBe('DELIVERED')
  })

  it('leaves occurredAt unset rather than inventing one', () => {
    const [e] = events(
      `<itemTracking><itemCode>${ITEM_CODE}</itemCode><stateInfo><stateCode>T00</stateCode></stateInfo></itemTracking>`,
    )
    expect(e?.occurredAt).toBeUndefined()
  })

  it('refuses a document with no itemCode', () => {
    expect(() => parseItemTracking(parseXml('<itemTracking></itemTracking>'))).toThrow(/itemCode/)
  })
})
