import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawZnodeWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/znode/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeWarehouse(overrides: Partial<RawZnodeWarehouse> = {}): RawZnodeWarehouse {
  return {
    WarehouseId: 5,
    WarehouseName: 'Frankfurt Warehouse',
    WarehouseCode: 'FRA-01',
    IsActive: true,
    Address1: 'Industriestrasse 42',
    CityName: 'Frankfurt',
    StateName: 'Hessen',
    PostalCode: '60311',
    CountryName: 'DE',
    PhoneNumber: '+49-69-1234567',
    ...overrides,
  }
}

describe('transformLocation (Znode)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.id).toBe('5')
    expect(result.name).toBe('Frankfurt Warehouse')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('+49-69-1234567')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('maps address fields correctly', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.address).toEqual({
      line1: 'Industriestrasse 42',
      line2: undefined,
      city: 'Frankfurt',
      region: 'Hessen',
      postalCode: '60311',
      country: 'DE',
    })
  })

  it('returns undefined address when all fields are empty', () => {
    const result = transformLocation(
      makeWarehouse({
        Address1: undefined,
        CityName: undefined,
        PostalCode: undefined,
        CountryName: undefined,
      }),
    )
    expect(result.address).toBeUndefined()
  })

  it('falls back to WarehouseCode when WarehouseName is missing', () => {
    const result = transformLocation(makeWarehouse({ WarehouseName: undefined }))
    expect(result.name).toBe('FRA-01')
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeWarehouse())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
