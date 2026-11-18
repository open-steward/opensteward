import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawShopwareWarehouse,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeWarehouse(
  overrides: Partial<RawShopwareWarehouse> = {},
): RawShopwareWarehouse {
  return {
    id: 'wh-abc123',
    name: 'Berlin Warehouse',
    active: true,
    street: 'Industriestrasse 10',
    city: 'Berlin',
    zipcode: '10115',
    country: { iso: 'DE', name: 'Germany' },
    phone: '+49 30 9876543',
    ...overrides,
  }
}

describe('transformLocation (Shopware)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.id).toBe('wh-abc123')
    expect(result.name).toBe('Berlin Warehouse')
    expect(result.active).toBe(true)
    expect(result.phone).toBe('+49 30 9876543')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('maps address fields', () => {
    const result = transformLocation(makeWarehouse())
    expect(result.address).toMatchObject({
      line1: 'Industriestrasse 10',
      city: 'Berlin',
      postalCode: '10115',
      country: 'DE',
    })
  })

  it('returns undefined address when no street or city', () => {
    const result = transformLocation(
      makeWarehouse({ street: undefined, city: undefined }),
    )
    expect(result.address).toBeUndefined()
  })

  it('falls back to country name when iso missing', () => {
    const result = transformLocation(
      makeWarehouse({ country: { name: 'Germany' } }),
    )
    expect(result.address?.country).toBe('Germany')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeWarehouse()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('validates against LocationSchema', () => {
    const result = transformLocation(makeWarehouse())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
