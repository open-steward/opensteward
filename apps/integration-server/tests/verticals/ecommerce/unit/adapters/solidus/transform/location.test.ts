import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSolidusStockLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/solidus/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeStockLocation(
  overrides: Partial<RawSolidusStockLocation> = {},
): RawSolidusStockLocation {
  return {
    id: 1,
    name: 'East Coast Warehouse',
    active: true,
    address1: '500 Logistics Way',
    address2: 'Building C',
    city: 'Newark',
    state_name: 'New Jersey',
    country_iso: 'US',
    zipcode: '07102',
    phone: '+1-555-0400',
    backorderable_default: true,
    propagate_all_variants: true,
    restock_inventory: true,
    default: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-03-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformLocation (Solidus)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeStockLocation())
    expect(result.id).toBe('1')
    expect(result.name).toBe('East Coast Warehouse')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('+1-555-0400')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformLocation(makeStockLocation())
    expect(result.address).toEqual({
      line1: '500 Logistics Way',
      line2: 'Building C',
      city: 'Newark',
      region: 'New Jersey',
      postalCode: '07102',
      country: 'US',
    })
  })

  it('returns undefined address when all fields empty', () => {
    const result = transformLocation(
      makeStockLocation({
        address1: null,
        address2: null,
        city: null,
        state_name: null,
        country_iso: null,
        zipcode: null,
      }),
    )
    expect(result.address).toBeUndefined()
  })

  it('preserves metadata', () => {
    const raw = makeStockLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies LocationSchema', () => {
    const result = transformLocation(makeStockLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
