/**
 * Metapack tracking events from GET /tracking/v1/parcel-journeys
 * (https://dev.metapack.com/tracking/reference/tracking/overview/). The spec
 * gives no whole-response example, so the fixture is built from documented
 * values only:
 *  - the ParcelJourney schema's property examples (carrierCode "DPD_UK",
 *    carrierServiceCode "DPD_UK_CLASSIC", eventCode
 *    "AWAITING_COLLECTION_FROM_PICKUP_POINT", statusCode "READY_TO_COLLECT",
 *    eventDescription / statusDescription "Ready to collect", address
 *    "200 Grays Inn Road" / "WC1X 8XZ" / "GBR");
 *  - rows of the "Supported tracking events" table
 *    (https://dev.metapack.com/tracking/basics/supported-tracking-events/):
 *    "13 | COLLECTION_MADE | IN_TRANSIT | HAPPY | Carrier Picked Up" and
 *    "44 | IN_TRANSIT | IN_TRANSIT | HAPPY | In Transit".
 * Test-only values, which the spec gives no example for: the eventDate
 * timestamps, the tracking identifiers and refs, and the first-mile carrier code.
 */
import { describe, it, expect } from 'vitest'
import {
  transformParcelJourneys,
  mapTrackingStatus,
  type MetapackParcelJourney,
} from '../../../../../../../src/verticals/logistics/adapters/metapack/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

const TRK = 'TRK123456789'

function journey(): MetapackParcelJourney {
  return {
    parcel: {
      deliveryRef: 'DEL-1',
      parcelRef: 'PAR-1',
      deliveryLegs: [
        {
          carrierCode: 'DPD_UK',
          carrierDisplayName: 'DPD UK',
          carrierServiceCode: 'DPD_UK_CLASSIC',
          carrierTrackingURL: `https://track.dpd.co.uk/parcels/${TRK}`,
          finalDeliveryLeg: true,
          trackingIdentifier: TRK,
        },
      ],
    },
    trackingEvents: [
      {
        trackingIdentifier: TRK,
        deliveryRef: 'DEL-1',
        eventCode: 'COLLECTION_MADE',
        eventDate: '2024-05-10T08:00:00Z',
        eventSource: 'CARRIER',
        eventTimeZone: 'Europe/London',
        eventDescription: 'Carrier Picked Up',
        eventCategory: 'HAPPY',
        statusCode: 'IN_TRANSIT',
      },
      {
        trackingIdentifier: TRK,
        deliveryRef: 'DEL-1',
        eventCode: 'AWAITING_COLLECTION_FROM_PICKUP_POINT',
        eventDate: '2024-05-11T09:30:00Z',
        eventSource: 'STORE',
        eventTimeZone: 'Europe/London',
        eventLocation: {
          address: {
            addressLine1: '200 Grays Inn Road',
            postCode: 'WC1X 8XZ',
            countryCode: 'GBR',
            companyName: 'Metapack',
            city: 'London',
            stateProvince: 'London',
            timeZone: 'Europe/London',
          },
        },
        eventDescription: 'Ready to collect',
        eventCategory: 'HAPPY',
        statusCode: 'READY_TO_COLLECT',
        statusDescription: 'Ready to collect',
      },
    ],
  }
}

describe('metapack transformParcelJourneys', () => {
  it('emits one schema-valid event per documented tracking event', () => {
    const events = transformParcelJourneys([journey()]).map((e) => TrackingEventSchema.parse(e))
    expect(events).toHaveLength(2)
  })

  it('maps the documented event fields', () => {
    const e = TrackingEventSchema.parse(transformParcelJourneys([journey()])[1])
    expect(e.id).toBe(`${TRK}:2024-05-11T09:30:00Z:AWAITING_COLLECTION_FROM_PICKUP_POINT`)
    expect(e.trackingNumber).toBe(TRK)
    expect(e.carrierId).toBe('DPD_UK')
    expect(e.status).toBe('AVAILABLE_FOR_PICKUP')
    expect(e.description).toBe('Ready to collect')
    expect(e.occurredAt).toEqual(new Date('2024-05-11T09:30:00Z'))
    expect(e.location).toEqual({
      company: 'Metapack',
      street1: '200 Grays Inn Road',
      city: 'London',
      state: 'London',
      postalCode: 'WC1X 8XZ',
    })
  })

  it('reads the description from eventDescription, not statusDescription', () => {
    const j = journey()
    j.trackingEvents![1]!.statusDescription = 'READY_TO_COLLECT stage'
    const [first, second] = transformParcelJourneys([j])
    expect(first!.description).toBe('Carrier Picked Up')
    expect(second!.description).toBe('Ready to collect')
  })

  it("takes each event's carrier from the delivery leg with the same trackingIdentifier", () => {
    const LEG2 = 'TRK-LEG-2'
    const j = journey()
    j.parcel!.deliveryLegs = [
      { carrierCode: 'FIRST_MILE', finalDeliveryLeg: false, trackingIdentifier: LEG2 },
      ...j.parcel!.deliveryLegs!,
    ]
    j.trackingEvents!.unshift({
      trackingIdentifier: LEG2,
      eventCode: 'IN_TRANSIT',
      eventDate: '2024-05-09T08:00:00Z',
      eventCategory: 'HAPPY',
      eventDescription: 'In Transit',
      statusCode: 'IN_TRANSIT',
    })
    const events = transformParcelJourneys([j]).map((e) => TrackingEventSchema.parse(e))
    expect(events.map((e) => [e.trackingNumber, e.carrierId])).toEqual([
      [LEG2, 'FIRST_MILE'],
      [TRK, 'DPD_UK'],
      [TRK, 'DPD_UK'],
    ])
  })

  it('emits the events of every journey returned, in order', () => {
    const TRK2 = 'TRK987654321'
    const other = journey()
    other.parcel!.deliveryLegs![0]!.trackingIdentifier = TRK2
    for (const e of other.trackingEvents!) e.trackingIdentifier = TRK2
    const events = transformParcelJourneys([journey(), other])
    expect(events.map((e) => e.trackingNumber)).toEqual([TRK, TRK, TRK2, TRK2])
    expect(new Set(events.map((e) => e.id)).size).toBe(4)
  })

  it('never maps the alpha-3 countryCode into the alpha-2 country', () => {
    const e = transformParcelJourneys([journey()])[1]!
    expect(e.location?.country).toBeUndefined()
  })

  it('returns no events, not a synthetic one, for a journey without events', () => {
    expect(transformParcelJourneys([{ ...journey(), trackingEvents: [] }])).toEqual([])
    expect(transformParcelJourneys([])).toEqual([])
  })

  it('leaves the id unset when a documented id part is missing', () => {
    const j = journey()
    delete j.trackingEvents![0]!.eventDate
    const e = TrackingEventSchema.parse(transformParcelJourneys([j])[0])
    expect(e.id).toBeUndefined()
    expect(e.occurredAt).toBeUndefined()
  })

  it('maps the documented statusCode enum', () => {
    const cases: Array<[string | undefined, string]> = [
      ['ORDER_PROCESSING', 'PRE_TRANSIT'],
      ['PERSONALISATION_IN_PROGRESS', 'PRE_TRANSIT'],
      ['PREPARING_FOR_DESPATCH', 'PRE_TRANSIT'],
      ['PROCESSING', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['READY_TO_COLLECT', 'AVAILABLE_FOR_PICKUP'],
      ['NOT_DELIVERED', 'FAILURE'],
      ['NOT_COLLECTED', 'FAILURE'],
      ['RETURN_TO_SENDER', 'RETURN_TO_SENDER'],
      ['CANCELLED_BEFORE_DESPATCH', 'UNKNOWN'],
      ['RETURN_CREATED', 'UNKNOWN'],
      [undefined, 'UNKNOWN'],
    ]
    for (const [code, want] of cases) expect(mapTrackingStatus(code)).toBe(want)
  })
})
