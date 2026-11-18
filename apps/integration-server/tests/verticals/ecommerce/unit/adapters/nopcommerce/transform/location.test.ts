import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/nopcommerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation (nopCommerce)', () => {
  it('returns a location with id "default"', () => {
    const result = syntheticDefaultLocation('https://shop.example.com')
    expect(result.id).toBe('default')
    expect(result.name).toBe('https://shop.example.com')
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('carries synthetic metadata', () => {
    const result = syntheticDefaultLocation('https://shop.example.com')
    expect((result.metadata as Record<string, unknown>)['synthetic']).toBe(true)
    expect((result.metadata as Record<string, unknown>)['host']).toBe('https://shop.example.com')
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = syntheticDefaultLocation('https://shop.example.com')
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
