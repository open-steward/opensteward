import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawShipBobFulfillmentCenter,
} from '../../../../../../../src/verticals/inventory/adapters/shipbob-inventory/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/inventory/schema/location'

/**
 * `GET /2026-01/fulfillment-center`, NOT `/location`.
 *
 * Both exist and they answer different questions. Verified live against the
 * sandbox on 2026-09-18:
 *
 *   /location            ShipBob's entire network — 69 centres, 65 of them
 *                        `access_granted: false`. Requires `locations_read`.
 *   /fulfillment-center  the 8 centres THIS merchant actually uses. Requires
 *                        no scope beyond what every other resource here needs.
 *
 * The decisive fact is referential: the location ids our stock levels emit
 * were 7, 9, 10, 80, 81, 82, 83, 85 and `/fulfillment-center` returned exactly
 * 80, 81, 82, 83, 7, 9, 10, 85 — the same set, eight for eight. A canonical
 * inventory Location is where stock sits, so this is the endpoint that makes
 * every `stockLevel.locationId` resolve.
 *
 * Its payload is also flat: the address is on the record rather than nested
 * inside `services[]` the way `/location` reports it.
 */
function raw(over: Partial<RawShipBobFulfillmentCenter> = {}): RawShipBobFulfillmentCenter {
  return {
    id: 80,
    name: 'US (CA) West Hub 1',
    timezone: 'Pacific Standard Time',
    address1: '28010 Eucalyptus Ave',
    address2: '',
    city: 'Moreno Valley',
    state: 'CA',
    country: 'US',
    zip_code: '92555',
    phone_number: '8444744726',
    email: 'support@shipbob.com',
    ...over,
  }
}

describe('shipbob-inventory locations', () => {
  it('produces canonical output that satisfies the schema', () => {
    expect(() => LocationSchema.parse(transformLocation(raw()))).not.toThrow()
  })

  it('maps the identity fields', () => {
    const l = transformLocation(raw())
    expect(l.id).toBe('80')
    expect(l.externalId).toBe('80')
    expect(l.name).toBe('US (CA) West Hub 1')
  })

  it('types every ShipBob location as a warehouse', () => {
    expect(transformLocation(raw()).type).toBe('warehouse')
  })

  it('maps the address the record carries directly', () => {
    expect(transformLocation(raw()).address).toEqual({
      line1: '28010 Eucalyptus Ave',
      line2: undefined,
      city: 'Moreno Valley',
      region: 'CA',
      postalCode: '92555',
      country: 'US',
    })
  })

  it('keeps a second address line when there is one', () => {
    const l = transformLocation(raw({ id: 7, address2: 'Suite 300' }))
    expect(l.address?.line2).toBe('Suite 300')
  })

  it('treats an empty address line as absent rather than as a blank line', () => {
    expect(transformLocation(raw()).address?.line2).toBeUndefined()
  })

  it('reports a centre this merchant uses as active', () => {
    // /fulfillment-center returns only the merchant's own centres — unlike
    // /location, which returns 69 and marks 65 as inaccessible.
    expect(transformLocation(raw()).isActive).toBe(true)
  })

  it('keeps the untouched vendor payload on raw', () => {
    expect(transformLocation(raw()).raw).toMatchObject({ timezone: 'Pacific Standard Time' })
  })

  it('does not lose a centre that reports no address', () => {
    const l = transformLocation({ id: 85, name: 'Unnamed Centre' })
    expect(() => LocationSchema.parse(l)).not.toThrow()
    expect(l.address).toBeUndefined()
  })
})

describe('shipbob-inventory locations — contact detail', () => {
  it('keeps the centre’s timezone, email and phone number', () => {
    // No canonical Location field holds these; without metadata they survive
    // only on `raw`, which strip-raw-payload can remove.
    expect(transformLocation(raw()).metadata).toEqual({
      timezone: 'Pacific Standard Time',
      email: 'support@shipbob.com',
      phoneNumber: '8444744726',
    })
  })

  it('omits contact detail the centre does not carry', () => {
    const l = transformLocation(raw({ timezone: null, email: '', phone_number: undefined }))
    expect(l.metadata).toEqual({})
    expect(() => LocationSchema.parse(l)).not.toThrow()
  })
})
