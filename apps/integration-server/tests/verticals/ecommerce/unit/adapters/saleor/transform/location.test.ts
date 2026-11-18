import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  untransformLocation,
  type RawSaleorWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/saleor/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeWarehouse(overrides: Partial<RawSaleorWarehouse> = {}): RawSaleorWarehouse {
  return {
    id: 'V2FyZWhvdXNlOjE=',
    name: 'Main Warehouse',
    isPrivate: false,
    address: {
      streetAddress1: '123 Warehouse St',
      streetAddress2: 'Unit B',
      city: 'Stockholm',
      countryArea: 'Stockholm',
      postalCode: '11122',
      country: { code: 'SE', country: 'Sweden' },
      phone: '+46 8 123456',
    },
    ...overrides,
  }
}

describe('transformLocation (Saleor)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.id).toBe('V2FyZWhvdXNlOjE=')
    expect(result.name).toBe('Main Warehouse')
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('maps address', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.address?.line1).toBe('123 Warehouse St')
    expect(result.address?.city).toBe('Stockholm')
    expect(result.address?.country).toBe('SE')
    expect(result.phone).toBe('+46 8 123456')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeWarehouse()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeWarehouse())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformLocation', () => {
    const canonical = transformLocation(makeWarehouse())
    const raw = untransformLocation(canonical)
    expect(raw['name']).toBe('Main Warehouse')
  })
})
