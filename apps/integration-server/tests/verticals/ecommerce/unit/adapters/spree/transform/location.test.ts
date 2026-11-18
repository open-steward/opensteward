import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawSpreeStockLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/spree/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeStockLocation(
  overrides: Partial<RawSpreeStockLocation> = {},
): RawSpreeStockLocation {
  return {
    id: 1,
    name: 'Main Warehouse',
    active: true,
    address1: '123 Commerce St',
    address2: 'Suite 200',
    city: 'Portland',
    state_name: 'Oregon',
    country_iso: 'US',
    zipcode: '97201',
    phone: '+1-555-0100',
    backorderable_default: false,
    propagate_all_variants: true,
    default: true,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-03-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformLocation (Spree)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeStockLocation())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Main Warehouse')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('+1-555-0100')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformLocation(makeStockLocation())
    expect(result.address).toEqual({
      line1: '123 Commerce St',
      line2: 'Suite 200',
      city: 'Portland',
      region: 'Oregon',
      postalCode: '97201',
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
