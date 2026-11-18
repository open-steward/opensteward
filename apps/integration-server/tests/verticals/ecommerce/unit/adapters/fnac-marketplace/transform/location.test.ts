import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/fnac-marketplace/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation (FNAC/WooCommerce)', () => {
  it('sets id to "default"', () => {
    const result = syntheticDefaultLocation('https://fnac.example.com')
    expect(result.id).toBe('default')
  })

  it('sets name to the site argument', () => {
    const result = syntheticDefaultLocation('https://fnac.example.com')
    expect(result.name).toBe('https://fnac.example.com')
  })

  it('sets active to true', () => {
    const result = syntheticDefaultLocation('https://fnac.example.com')
    expect(result.active).toBe(true)
  })

  it('sets isFulfillmentCenter to true', () => {
    const result = syntheticDefaultLocation('https://fnac.example.com')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('marks metadata as synthetic', () => {
    const result = syntheticDefaultLocation('https://fnac.example.com')
    expect((result.metadata as any).synthetic).toBe(true)
  })

  it('produces a payload satisfying LocationSchema', () => {
    const result = syntheticDefaultLocation('https://fnac.example.com')
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
