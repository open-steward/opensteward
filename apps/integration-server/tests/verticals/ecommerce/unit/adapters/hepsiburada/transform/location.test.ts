import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/hepsiburada/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation (hepsiburada / WooCommerce)', () => {
  it('returns id "default"', () => {
    const result = syntheticDefaultLocation('https://mymag.hepsiburada.com')
    expect(result.id).toBe('default')
  })

  it('uses site URL as name', () => {
    const result = syntheticDefaultLocation('https://mymag.hepsiburada.com')
    expect(result.name).toBe('https://mymag.hepsiburada.com')
  })

  it('marks the location as active', () => {
    const result = syntheticDefaultLocation('https://mymag.hepsiburada.com')
    expect(result.active).toBe(true)
  })

  it('marks the location as a fulfillment center', () => {
    const result = syntheticDefaultLocation('https://mymag.hepsiburada.com')
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('annotates metadata with synthetic flag and site url', () => {
    const site = 'https://mymag.hepsiburada.com'
    const result = syntheticDefaultLocation(site)
    expect((result.metadata as Record<string, unknown>)['synthetic']).toBe(true)
    expect((result.metadata as Record<string, unknown>)['site']).toBe(site)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    expect(() =>
      LocationSchema.parse(syntheticDefaultLocation('https://mymag.hepsiburada.com')),
    ).not.toThrow()
  })
})
