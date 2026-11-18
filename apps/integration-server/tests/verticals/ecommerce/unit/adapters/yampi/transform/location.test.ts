import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/yampi/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation (Yampi/WooCommerce)', () => {
  it('sets id to "default"', () => {
    const result = syntheticDefaultLocation('https://mystore.com')
    expect(result.id).toBe('default')
  })

  it('uses the site URL as the location name', () => {
    const result = syntheticDefaultLocation('https://mystore.com')
    expect(result.name).toBe('https://mystore.com')
  })

  it('marks location as active and a fulfillment center', () => {
    const result = syntheticDefaultLocation('https://mystore.com')
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('includes synthetic marker in metadata', () => {
    const result = syntheticDefaultLocation('https://mystore.com')
    expect((result.metadata as Record<string, unknown>)['synthetic']).toBe(true)
    expect((result.metadata as Record<string, unknown>)['site']).toBe('https://mystore.com')
  })

  it('works with different site URLs', () => {
    const result = syntheticDefaultLocation('https://store.yampi.com.br')
    expect(result.name).toBe('https://store.yampi.com.br')
  })

  it('produces a payload that satisfies LocationSchema', () => {
    expect(() =>
      LocationSchema.parse(syntheticDefaultLocation('https://mystore.com')),
    ).not.toThrow()
  })
})
