import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawLoyverseStore,
} from '../../../../../../../src/verticals/ecommerce/adapters/loyverse/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeRaw(overrides: Partial<RawLoyverseStore> = {}): RawLoyverseStore {
  return {
    id: 'store_001',
    name: 'Downtown Shop',
    address: '456 Market St',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94105',
    country: 'US',
    phone_number: '+14155550100',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLocation (Loyverse)', () => {
  it('maps id and name', () => {
    const result = transformLocation(makeRaw())
    expect(result.id).toBe('store_001')
    expect(result.name).toBe('Downtown Shop')
  })

  it('sets active to true when deleted_at is null', () => {
    const result = transformLocation(makeRaw({ deleted_at: null }))
    expect(result.active).toBe(true)
  })

  it('sets active to false when deleted_at is present', () => {
    const result = transformLocation(makeRaw({ deleted_at: '2024-06-01T00:00:00Z' }))
    expect(result.active).toBe(false)
  })

  it('maps address fields (state → region)', () => {
    const result = transformLocation(makeRaw())
    expect(result.address).toEqual({
      line1: '456 Market St',
      city: 'San Francisco',
      region: 'CA',
      postalCode: '94105',
      country: 'US',
    })
  })

  it('maps phone_number to phone', () => {
    const result = transformLocation(makeRaw())
    expect(result.phone).toBe('+14155550100')
  })

  it('sets isFulfillmentCenter to true', () => {
    const result = transformLocation(makeRaw())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('omits address when all address fields are absent', () => {
    const result = transformLocation(
      makeRaw({ address: null, city: null, postal_code: null, country: null }),
    )
    expect(result.address).toBeUndefined()
  })

  it('produces schema-valid output', () => {
    const result = transformLocation(makeRaw())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output with minimal input', () => {
    const minimal: RawLoyverseStore = { id: 'store_min', name: 'Min Store' }
    const result = transformLocation(minimal)
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
