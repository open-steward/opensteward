import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/wildberries/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation (Wildberries/WooCommerce)', () => {
  it('sets id to "default"', () => {
    const result = syntheticDefaultLocation('https://mystore.example.com')
    expect(result.id).toBe('default')
  })

  it('uses the site argument as the location name', () => {
    const result = syntheticDefaultLocation('https://mystore.example.com')
    expect(result.name).toBe('https://mystore.example.com')
  })

  it('sets active to true', () => {
    const result = syntheticDefaultLocation('https://mystore.example.com')
    expect(result.active).toBe(true)
  })

  it('sets isFulfillmentCenter to true', () => {
    const result = syntheticDefaultLocation('https://mystore.example.com')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('includes synthetic metadata flag', () => {
    const result = syntheticDefaultLocation('https://mystore.example.com')
    expect(result.metadata).toMatchObject({ synthetic: true })
  })

  it('stores site in metadata', () => {
    const result = syntheticDefaultLocation('https://shop.wildberries.ru')
    expect(result.metadata).toMatchObject({ site: 'https://shop.wildberries.ru' })
  })

  it('produces a payload that satisfies LocationSchema', () => {
    expect(() =>
      LocationSchema.parse(syntheticDefaultLocation('https://mystore.example.com')),
    ).not.toThrow()
  })
})
