import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawShopifyLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopify/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawShopifyLocation> = {}): RawShopifyLocation {
  return {
    id: 42,
    name: 'Main Warehouse',
    active: true,
    address1: '123 Warehouse Way',
    address2: 'Suite 100',
    city: 'Austin',
    zip: '78701',
    province: 'Texas',
    province_code: 'TX',
    country: 'United States',
    country_code: 'US',
    phone: '+1 512 555 1212',
    legacy: false,
    ...overrides,
  }
}

describe('transformLocation', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.name).toBe('Main Warehouse')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('+1 512 555 1212')
  })

  it('maps nested address fields', () => {
    const result = transformLocation(makeLocation())
    expect(result.address?.line1).toBe('123 Warehouse Way')
    expect(result.address?.line2).toBe('Suite 100')
    expect(result.address?.city).toBe('Austin')
    expect(result.address?.postalCode).toBe('78701')
    expect(result.address?.country).toBe('US')
  })

  it('marks active non-legacy locations as fulfillment centres', () => {
    const result = transformLocation(makeLocation())
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
