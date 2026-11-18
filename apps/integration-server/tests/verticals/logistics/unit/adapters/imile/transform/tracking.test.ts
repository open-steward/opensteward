/**
 * transformTracking maps the `data` object of "Order Track Query (Single)",
 * POST /client/track/getOne
 * (https://developer.imile.com/apis/details/1826891449751908354).
 *
 * Its `locus` array is the track: each entry has latestStatus, latestStatusTime
 * ("time format yyyy-MM-DD hh:mm:ss"), latestSite, locusDetailed ("Track
 * details"), locusType and timeZone ("GMT+08:00").
 */
import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type IMileTrackOne,
} from '../../../../../../../src/verticals/logistics/adapters/imile/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { SIGNATURE_EXAMPLE_TRACK_DATA, TRACK_GET_ONE_DATA } from '../fixtures'

describe('imile transformTracking (client/track/getOne)', () => {
  it('returns one event per locus entry, each passing TrackingEventSchema', () => {
    const events = transformTracking(TRACK_GET_ONE_DATA)
    expect(events).toHaveLength(1)
    for (const e of events) TrackingEventSchema.parse(e)
  })

  it('keys events on the iMile waybill number (billNo)', () => {
    const [e] = transformTracking(TRACK_GET_ONE_DATA)
    expect(e!.trackingNumber).toBe('6063024371258')
    expect(e!.shipmentId).toBe('6063024371258')
    expect(e!.carrierId).toBe('imile')
  })

  it('uses locusDetailed as the description', () => {
    const [e] = transformTracking(TRACK_GET_ONE_DATA)
    expect(e!.description).toBe('【Mexico Return Center】Shipment received.')
  })

  it('reads latestStatusTime in the entry’s own timeZone', () => {
    expect(transformTracking(TRACK_GET_ONE_DATA)[0]!.occurredAt).toEqual(
      new Date('2024-08-06T14:08:39.000Z'),
    )
    expect(transformTracking(SIGNATURE_EXAMPLE_TRACK_DATA)[0]!.occurredAt).toEqual(
      new Date('2024-08-27T22:27:57.000Z'),
    )
  })

  it('leaves occurredAt unset rather than guessing a zone', () => {
    const data: IMileTrackOne = {
      ...TRACK_GET_ONE_DATA,
      locus: [{ ...TRACK_GET_ONE_DATA.locus![0]!, timeZone: null }],
    }
    const [e] = transformTracking(data)
    expect(e!.occurredAt).toBeUndefined()
    TrackingEventSchema.parse(e)
  })

  it('reports UNKNOWN status: iMile publishes no Track Status dictionary', () => {
    for (const data of [TRACK_GET_ONE_DATA, SIGNATURE_EXAMPLE_TRACK_DATA]) {
      for (const e of transformTracking(data)) expect(e.status).toBe('UNKNOWN')
    }
  })

  it('keeps iMile’s own status, type, site and customer order number in metadata', () => {
    const [e] = transformTracking(TRACK_GET_ONE_DATA)
    expect(e!.metadata).toMatchObject({
      latestStatus: 'ReturnArrive',
      latestStatusTime: '2024-08-06 22:08:39',
      locusType: 'scan',
      latestSite: 'Mexico Return Center',
      timeZone: 'GMT+08:00',
      longitude: '8.15478914',
      latitude: '49.9871668',
      orderNo: '8238892418162461569',
      orderType: '100',
    })
    expect((e!.metadata!.pods as string[])[0]).toMatch(/^https:\/\/s3-eu-imile/)
  })

  it('passes TrackingEventSchema for the signature document’s example too', () => {
    const events = transformTracking(SIGNATURE_EXAMPLE_TRACK_DATA)
    expect(events).toHaveLength(1)
    for (const e of events) TrackingEventSchema.parse(e)
    expect(events[0]!.description).toBe('Order Submited.')
  })

  it('returns no events when locus is empty or missing', () => {
    expect(transformTracking({ ...TRACK_GET_ONE_DATA, locus: [] })).toEqual([])
    expect(transformTracking({ ...TRACK_GET_ONE_DATA, locus: null })).toEqual([])
  })
})
