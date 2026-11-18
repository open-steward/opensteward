/**
 * Wix business Location → canonical Location.
 *
 * Fixture fields follow the REST `Location` schema of Query Locations / Get
 * Location (business-management/locations/query-locations.md). The values are
 * those of Query Locations' documented example ("Bellamystraat", Amsterdam);
 * the SDK example's `_id` and `address.formatted` are the REST `id` and
 * `address.formattedAddress`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawWixLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/wix/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawWixLocation> = {}): RawWixLocation {
  return {
    id: '5c6e81a4-5270-4f66-9688-49d1fd9153ef',
    name: 'Bellamystraat',
    default: false,
    status: 'ACTIVE',
    email: 'amsterdam.store@example.com',
    phone: '+31 20 123 4567',
    address: {
      country: 'NL',
      subdivision: 'NH',
      city: 'Amsterdam',
      postalCode: '1053 BE',
      streetAddress: { number: '3', name: 'Bellamystraat', apt: '' },
      formattedAddress: 'CityHub, Bellamystraat, Amsterdam, Netherlands',
    },
    archived: false,
    ...overrides,
  }
}

describe('transformLocation', () => {
  it('parses with LocationSchema and maps the documented fields', () => {
    const l = LocationSchema.parse(transformLocation(makeLocation()))
    expect(l.id).toBe('5c6e81a4-5270-4f66-9688-49d1fd9153ef')
    expect(l.name).toBe('Bellamystraat')
    expect(l.active).toBe(true)
    expect(l.phone).toBe('+31 20 123 4567')
    expect(l.address).toEqual({
      line1: '3 Bellamystraat',
      city: 'Amsterdam',
      region: 'NH',
      postalCode: '1053 BE',
      country: 'NL',
    })
  })

  it('maps streetAddress.apt to line2 when it is set', () => {
    const l = transformLocation(
      makeLocation({
        address: {
          city: 'Amsterdam',
          streetAddress: { number: '3', name: 'Bellamystraat', apt: '2' },
        },
      }),
    )
    expect(l.address?.line2).toBe('2')
  })

  it('an archived location is inactive', () => {
    expect(transformLocation(makeLocation({ archived: true })).active).toBe(false)
  })

  it('an INACTIVE status is inactive', () => {
    expect(transformLocation(makeLocation({ status: 'INACTIVE' })).active).toBe(false)
  })

  it('does not assume an activity or fulfillment role it was not told', () => {
    const l = transformLocation(makeLocation({ status: undefined, archived: undefined }))
    expect(l.active).toBeUndefined()
    expect(l.isFulfillmentCenter).toBeUndefined()
  })

  it('refuses a location with no id or no name rather than inventing one', () => {
    expect(() => transformLocation(makeLocation({ id: undefined }))).toThrow(/id/)
    expect(() => transformLocation(makeLocation({ name: undefined }))).toThrow(/name/)
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeLocation()
    expect(transformLocation(raw).metadata).toBe(raw)
  })
})
