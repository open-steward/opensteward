import { describe, it, expect } from 'vitest'
import { transformAddress } from '../../../../../../../src/verticals/logistics/adapters/skydropx/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'
import { docAddress } from '../fixtures'

describe('Skydropx transformAddress (PRO included address)', () => {
  it('maps the documented example and parses as AddressSchema', () => {
    const out = AddressSchema.parse(transformAddress(docAddress('a1', 'to')))
    expect(out).toEqual({
      name: 'Juan',
      company: 'Company name',
      street1: 'Persia 143',
      city: 'Venustiano Carranza',
      state: 'Ciudad de México',
      postalCode: '15400',
      country: 'MX',
      phone: '3453453453453',
      email: 'juan@mail.com',
    })
  })

  it('maps apartment_number to street2', () => {
    const a = docAddress('a1', 'to')
    a.attributes!.apartment_number = '4B'
    expect(transformAddress(a).street2).toBe('4B')
  })

  it('omits a country_code that is not ISO alpha-2 instead of guessing', () => {
    const a = docAddress('a1', 'to')
    a.attributes!.country_code = 'MEX'
    const out = AddressSchema.parse(transformAddress(a))
    expect(out.country).toBeUndefined()
  })

  it('omits an email the schema would reject', () => {
    const a = docAddress('a1', 'to')
    a.attributes!.email = 'not-an-email'
    expect(AddressSchema.parse(transformAddress(a)).email).toBeUndefined()
  })
})
