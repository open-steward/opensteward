/**
 * Cafe24 shipping origin → canonical Location.
 *
 * Fixture: the documented example of GET /api/v2/admin/shippingorigins
 * (https://apidocs.cafe24.com/en/docs/admin/get-shippingorigins), first row.
 */
import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawCafe24ShippingOrigin,
} from '../../../../../../../src/verticals/ecommerce/adapters/cafe24/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

const documented: RawCafe24ShippingOrigin = {
  origin_code: 'W0000000',
  origin_name: 'Dongjak-gu Warehouse',
  default: 'F',
  contact: '010-0000-0000',
  secondary_contact: '010-0000-0000',
  zipcode: '07071',
  country_code: 'KR',
  address1: 'Sindaebang dong Dongjak-gu, Seoul, Republic of Korea',
  address2: 'Professional Construction Hall',
  variants: ['P000000C000Q', 'P000000C000R'],
}

describe('transformLocation (cafe24 shipping origin)', () => {
  it('maps the documented example and parses with LocationSchema', () => {
    const loc = LocationSchema.parse(transformLocation(documented))
    expect(loc).toEqual({
      id: 'W0000000',
      name: 'Dongjak-gu Warehouse',
      phone: '010-0000-0000',
      address: {
        line1: 'Sindaebang dong Dongjak-gu, Seoul, Republic of Korea',
        line2: 'Professional Construction Hall',
        postalCode: '07071',
        country: 'KR',
      },
      metadata: {
        originCode: 'W0000000',
        default: 'F',
        secondaryContact: '010-0000-0000',
        variants: ['P000000C000Q', 'P000000C000R'],
      },
    })
  })

  it('reads phone from contact, not secondary_contact', () => {
    // The documented example repeats one number in both fields; distinct
    // values pin which one becomes the canonical phone.
    const loc = LocationSchema.parse(
      transformLocation({
        ...documented,
        contact: '010-1111-1111',
        secondary_contact: '010-2222-2222',
      }),
    )
    expect(loc.phone).toBe('010-1111-1111')
    expect(loc.metadata).toMatchObject({ secondaryContact: '010-2222-2222' })
  })

  it('does not invent active or fulfillment flags: no documented field carries them', () => {
    const loc = transformLocation(documented)
    expect(loc.active).toBeUndefined()
    expect(loc.isFulfillmentCenter).toBeUndefined()
  })

  it('omits the address and phone when the origin carries none', () => {
    const loc = LocationSchema.parse(
      transformLocation({ origin_code: 'W000000B', origin_name: 'Boramae Warehouse' }),
    )
    expect(loc.address).toBeUndefined()
    expect(loc.phone).toBeUndefined()
    expect(loc.metadata).toEqual({ originCode: 'W000000B' })
  })
})
