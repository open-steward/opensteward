/**
 * Cubbo `shipping` object → canonical Address, against the documented
 * GET /v1/orders example (developers.cubbo.com, "Get Orders").
 */
import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type CubboAddress,
} from '../../../../../../../src/verticals/logistics/adapters/cubbo/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

const DOCUMENTED: CubboAddress = {
  first_name: 'edo',
  last_name: 'mon',
  company: null,
  phone: '5555555555',
  address_1: 'homero 100',
  address_2: null,
  email: 'edo@cubbo.com',
  zip_code: '11550',
  country: 'MX',
  state: 'cdmx',
  city: 'cdmx',
  number: null,
  neighborhood: null,
}

describe('cubbo transformAddress', () => {
  it('maps the documented shipping object and passes AddressSchema', () => {
    expect(AddressSchema.parse(transformAddress(DOCUMENTED))).toEqual({
      name: 'edo mon',
      street1: 'homero 100',
      city: 'cdmx',
      state: 'cdmx',
      postalCode: '11550',
      country: 'MX',
      phone: '5555555555',
      email: 'edo@cubbo.com',
    })
  })

  it('keeps company and address_2 when present', () => {
    const out = AddressSchema.parse(
      transformAddress({ ...DOCUMENTED, company: 'Cubbo', address_2: 'Depto 4' }),
    )
    expect(out.company).toBe('Cubbo')
    expect(out.street2).toBe('Depto 4')
  })

  it('omits a country that is not an ISO alpha-2 code, and an invalid email', () => {
    // The documented "Get Orders List" example carries `"email": "a"`.
    const out = AddressSchema.parse(
      transformAddress({ ...DOCUMENTED, country: 'mexico', email: 'a' }),
    )
    expect(out.country).toBeUndefined()
    expect(out.email).toBeUndefined()
  })

  it('uses the first name alone when there is no last name', () => {
    expect(transformAddress({ ...DOCUMENTED, last_name: null }).name).toBe('edo')
  })

  it('an all-null shipping object maps to an empty address', () => {
    expect(AddressSchema.parse(transformAddress({}))).toEqual({})
  })
})
