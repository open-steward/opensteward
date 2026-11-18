import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawOroWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/orocommerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeWarehouse(overrides: Partial<RawOroWarehouse> = {}): RawOroWarehouse {
  return {
    id: '5',
    name: 'Frankfurt Warehouse',
    enabled: true,
    street: 'Industriestrasse 42',
    city: 'Frankfurt',
    region: 'Hessen',
    postalCode: '60311',
    country: 'DE',
    phone: '+49-69-1234567',
    _type: 'warehouses',
    ...overrides,
  }
}

describe('transformLocation (OroCommerce)', () => {
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
      makeWarehouse({ street: undefined, city: undefined, postalCode: undefined, country: undefined }),
    )
    expect(result.address).toBeUndefined()
  })

  it('falls back to label when name is missing', () => {
    const result = transformLocation(makeWarehouse({ name: undefined, label: 'Backup WH' }))
    expect(result.name).toBe('Backup WH')
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeWarehouse())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
