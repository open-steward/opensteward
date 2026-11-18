import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/yokart/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation', () => {
  it('returns id "default"', () => {
    const result = syntheticDefaultLocation('https://mystore.yokart.com')
    expect(result.id).toBe('default')
  })

  it('uses site as the location name', () => {
    const result = syntheticDefaultLocation('https://mystore.yokart.com')
    expect(result.name).toBe('https://mystore.yokart.com')
  })

  it('sets active to true', () => {
    const result = syntheticDefaultLocation('https://mystore.yokart.com')
    expect(result.active).toBe(true)
  })

  it('sets isFulfillmentCenter to true', () => {
    const result = syntheticDefaultLocation('https://mystore.yokart.com')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('includes synthetic flag in metadata', () => {
    const result = syntheticDefaultLocation('https://mystore.yokart.com')
    expect((result.metadata as Record<string, unknown>)['synthetic']).toBe(true)
  })

  it('includes site in metadata', () => {
    const result = syntheticDefaultLocation('https://mystore.yokart.com')
    expect((result.metadata as Record<string, unknown>)['site']).toBe('https://mystore.yokart.com')
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = syntheticDefaultLocation('https://mystore.yokart.com')
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
