/**
 * GET /customer/address answers with an array of AddressModel, documented at
 * https://ppl-cpl-api-en.apidog.io/customer-addresess-13601472e0.md as exactly
 * { code, name, name2, street, city, zipCode, country, default }
 * ("additionalProperties: false"). The fixtures below use those keys only.
 */
import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type PplCzCustomerAddress,
} from '../../../../../../../src/verticals/logistics/adapters/ppl-cz/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

const DOCUMENTED: PplCzCustomerAddress = {
  code: 'PRG1',
  name: 'Prague Central',
  name2: 'Acme s.r.o.',
  street: 'Central Ave 1',
  city: 'Praha',
  zipCode: '11000',
  country: 'CZ',
  default: true,
}

describe('transformWarehouse', () => {
  it('maps every documented field and parses with WarehouseSchema', () => {
    const result = WarehouseSchema.parse(transformWarehouse(DOCUMENTED))
    expect(result.id).toBe('PRG1')
    expect(result.code).toBe('PRG1')
    expect(result.name).toBe('Prague Central')
    expect(result.address).toEqual({
      name: 'Prague Central',
      company: 'Acme s.r.o.',
      street1: 'Central Ave 1',
      city: 'Praha',
      postalCode: '11000',
      country: 'CZ',
    })
    expect(result.metadata).toEqual(DOCUMENTED)
  })

  it('does not fill name from name2: name2 is the company line', () => {
    const result = WarehouseSchema.parse(
      transformWarehouse({ code: 'OST1', name2: 'Ostrava s.r.o.' }),
    )
    expect(result.name).toBeUndefined()
    expect(result.address?.company).toBe('Ostrava s.r.o.')
  })

  it('invents no isActive: the AddressModel has no status field', () => {
    expect(transformWarehouse(DOCUMENTED).isActive).toBeUndefined()
  })

  it('omits a country that is not an ISO 3166 alpha-2 code rather than guessing', () => {
    const result = WarehouseSchema.parse(transformWarehouse({ ...DOCUMENTED, country: 'CZE' }))
    expect(result.address?.country).toBeUndefined()
    expect(result.address?.city).toBe('Praha')
  })

  it('omits a lowercase country instead of upper-casing it into a code the docs never sent', () => {
    const result = WarehouseSchema.parse(transformWarehouse({ ...DOCUMENTED, country: 'cz' }))
    expect(result.address?.country).toBeUndefined()
    expect(result.address?.city).toBe('Praha')
  })

  it('parses with all nullable fields null', () => {
    const result = WarehouseSchema.parse(
      transformWarehouse({
        code: null,
        name: null,
        name2: null,
        street: null,
        city: null,
        zipCode: null,
        country: null,
        default: false,
      }),
    )
    expect(result.id).toBeUndefined()
    expect(result.address).toBeUndefined()
  })
})
