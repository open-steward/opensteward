/**
 * Fixture: the documented example of GetTrackingResponse
 * (https://api.shippypro.com/docs/v1.json): Carrier "UPS", StatusCode 6,
 * Details [{date "1489659960", message "DELIVERED", city "MOTRIL", StatusCode 6}].
 */
import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  mapTrackingStatusCode,
  fromUnixSeconds,
  type ShippyProTracking,
} from '../../../../../../../src/verticals/logistics/adapters/shippypro/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

const DOC: ShippyProTracking = {
  Carrier: 'UPS',
  CarrierLogo:
    'https://www.shippypro.com/sites/all/themes/shippypro_theme/assets_pannello/images/corrieri/Logo_UPS.png',
  Completed: true,
  EstimatedDeliveryDate: '1489659960',
  StatusCode: 6,
  ExtendedStatusCode: 6000,
  FirstStatusDate: '1489419660',
  Late: false,
  ExternalLink: 'https://mailingtechnology.com/tracking/?tn=UD26123123456',
  Details: [{ date: '1489659960', message: 'DELIVERED', city: 'MOTRIL', StatusCode: 6 }],
}

describe('transformTracking (shippypro GetTracking)', () => {
  it('maps each documented Details entry to one event', () => {
    const events = transformTracking(DOC, '1ZA103756899507566').map((e) =>
      TrackingEventSchema.parse(e),
    )
    expect(events).toHaveLength(1)
    const [e] = events
    expect(e!.trackingNumber).toBe('1ZA103756899507566')
    expect(e!.status).toBe('DELIVERED')
    expect(e!.description).toBe('DELIVERED')
    expect(e!.location).toEqual({ city: 'MOTRIL' })
    expect(e!.occurredAt).toEqual(new Date(1489659960 * 1000))
  })

  it('returns no events when Details is empty: the top-level StatusCode is not an event', () => {
    expect(transformTracking({ ...DOC, Details: [] }, 'X')).toEqual([])
    expect(transformTracking({ Carrier: 'UPS', StatusCode: 2 }, 'X')).toEqual([])
  })

  it('maps the seven documented tracking code values, and anything else to UNKNOWN', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, undefined].map(mapTrackingStatusCode)).toEqual([
      'PRE_TRANSIT',
      'PRE_TRANSIT',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'FAILURE',
      'FAILURE',
      'DELIVERED',
      'UNKNOWN',
      'UNKNOWN',
    ])
  })

  it('reads Unix seconds, as a string, and nothing else', () => {
    expect(fromUnixSeconds('1489659960')).toEqual(new Date('2017-03-16T10:26:00.000Z'))
    expect(fromUnixSeconds('')).toBeUndefined()
    expect(fromUnixSeconds('not a date')).toBeUndefined()
    expect(fromUnixSeconds(null)).toBeUndefined()
  })
})
