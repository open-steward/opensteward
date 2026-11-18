import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/xt-commerce/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation (xt-commerce)', () => {
  it('returns id "default"', () => {
    const result = syntheticDefaultLocation('https://myshop.example.com')
    expect(result.id).toBe('default')
  })

  it('uses the site URL as the display name', () => {
    const result = syntheticDefaultLocation('https://myshop.example.com')
    expect(result.name).toBe('https://myshop.example.com')
  })

  it('sets active to true', () => {
    const result = syntheticDefaultLocation('https://myshop.example.com')
    expect(result.active).toBe(true)
  })

  it('sets isFulfillmentCenter to true', () => {
    const result = syntheticDefaultLocation('https://myshop.example.com')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('marks metadata.synthetic as true', () => {
    const result = syntheticDefaultLocation('https://myshop.example.com')
    expect(result.metadata['synthetic']).toBe(true)
  })

  it('produces a payload satisfying LocationSchema', () => {
    const result = syntheticDefaultLocation('https://myshop.example.com')
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
