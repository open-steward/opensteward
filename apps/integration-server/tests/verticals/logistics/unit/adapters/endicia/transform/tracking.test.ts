/**
 * Endicia (SERA) tracking transform.
 *
 * The fixture follows the documented 200 response of GET /v1/tracking
 * (https://developer.stamps.com/rest-api/reference/serav1.html):
 * `tracking_number`, `carrier_name`, `status_code` (enum accepted, delivered,
 * exception, awaiting_shipment, in_transit), `carrier_status_description`,
 * `estimated_delivery_date`, `destination{}` and `tracking_events[]` of
 * `{ occurred_at, event_description, city, state_province, postal_code,
 * country_code, signed_by, carrier_status_code }`. The reference gives no
 * example body, so values are illustrative.
 */
import { describe, it, expect } from 'vitest'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import {
  transformTracking,
  type EndiciaTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/endicia/transform/tracking'

function response(overrides: Partial<EndiciaTrackingResponse> = {}): EndiciaTrackingResponse {
  return {
    tracking_number: '9400111899223197428490',
    carrier_name: 'USPS',
    status_code: 'in_transit',
    carrier_status_description: 'In Transit, Arriving On Time',
    estimated_delivery_date: '2026-09-26',
    destination: { city: 'Austin', state_province: 'TX', postal_code: '78701', country_code: 'US' },
    tracking_events: [
      {
        occurred_at: '2026-09-23T14:05:00Z',
        event_description: 'Departed USPS Regional Facility',
        city: 'Dallas',
        state_province: 'TX',
        postal_code: '75260',
        country_code: 'US',
        carrier_status_code: 'T1',
      },
      {
        occurred_at: '2026-09-22T09:12:00Z',
        event_description: 'USPS in possession of item',
        city: 'Los Angeles',
        state_province: 'CA',
        postal_code: '90052',
        country_code: 'US',
        carrier_status_code: '03',
      },
    ],
    ...overrides,
  }
}

describe('Endicia transformTracking', () => {
  it('maps every documented event to a schema-valid tracking event', () => {
    const events = transformTracking(response(), '9400111899223197428490').map((e) =>
      TrackingEventSchema.parse(e),
    )
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      trackingNumber: '9400111899223197428490',
      description: 'Departed USPS Regional Facility',
      location: { city: 'Dallas', state: 'TX', postalCode: '75260', country: 'US' },
    })
    expect(events[0].occurredAt?.toISOString()).toBe('2026-09-23T14:05:00.000Z')
  })

  it('gives events no status: status_code is the current status and carrier_status_code has no documented values', () => {
    const events = transformTracking(response({ status_code: 'delivered' }), 'x')
    for (const e of events) expect(e.status).toBeUndefined()
  })

  it('returns no events for an empty history instead of a synthetic one', () => {
    expect(transformTracking(response({ tracking_events: [] }), 'x')).toEqual([])
    expect(transformTracking(response({ tracking_events: undefined }), 'x')).toEqual([])
  })

  it('sets carrierId only from the carrier the caller asked about', () => {
    expect(transformTracking(response(), 'x')[0].carrierId).toBeUndefined()
    expect(transformTracking(response(), 'x', 'usps')[0].carrierId).toBe('usps')
  })

  it('never invents occurredAt or a location', () => {
    const [e] = transformTracking(
      response({ tracking_events: [{ event_description: 'Label created' }] }),
      'x',
    )
    TrackingEventSchema.parse(e)
    expect(e.occurredAt).toBeUndefined()
    expect(e.location).toBeUndefined()
  })

  it('drops a country_code that is not ISO 3166 alpha-2', () => {
    const [e] = transformTracking(
      response({ tracking_events: [{ city: 'Toronto', country_code: 'CAN' }] }),
      'x',
    )
    expect(TrackingEventSchema.parse(e).location).toEqual({ city: 'Toronto' })
  })

  it('prefers the documented response tracking_number over the requested one', () => {
    const [e] = transformTracking(response({ tracking_number: '9400SERA0000000000001' }), 'REQ123')
    expect(TrackingEventSchema.parse(e).trackingNumber).toBe('9400SERA0000000000001')
  })

  it('falls back to the requested tracking number when the response omits it', () => {
    const [e] = transformTracking(response({ tracking_number: undefined }), 'REQ123')
    expect(e.trackingNumber).toBe('REQ123')
  })
})
