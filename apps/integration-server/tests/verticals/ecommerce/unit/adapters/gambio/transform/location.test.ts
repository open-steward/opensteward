import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/gambio/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation (Gambio / WooCommerce)', () => {
  it('returns a location with id "default"', () => {
    const result = syntheticDefaultLocation('https://mystore.gambio.de')
    expect(result.id).toBe('default')
  })

  it('uses the site URL as the location name', () => {
    const result = syntheticDefaultLocation('https://mystore.gambio.de')
    expect(result.name).toBe('https://mystore.gambio.de')
  })

  it('is active and a fulfillment center', () => {
    const result = syntheticDefaultLocation('https://mystore.gambio.de')
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('marks the location as synthetic in metadata', () => {
    const result = syntheticDefaultLocation('https://mystore.gambio.de')
    const meta = result.metadata as { synthetic: boolean; site: string }
    expect(meta.synthetic).toBe(true)
    expect(meta.site).toBe('https://mystore.gambio.de')
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = syntheticDefaultLocation('https://mystore.gambio.de')
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
