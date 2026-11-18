import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/vnda/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation (VNDA/WooCommerce)', () => {
  it('always returns id=default', () => {
    const result = syntheticDefaultLocation('https://mystore.vnda.com.br')
    expect(result.id).toBe('default')
  })

  it('uses site URL as name', () => {
    const result = syntheticDefaultLocation('https://mystore.vnda.com.br')
    expect(result.name).toBe('https://mystore.vnda.com.br')
  })

  it('sets active=true', () => {
    expect(syntheticDefaultLocation('https://mystore.vnda.com.br').active).toBe(true)
  })

  it('sets isFulfillmentCenter=true', () => {
    expect(syntheticDefaultLocation('https://mystore.vnda.com.br').isFulfillmentCenter).toBe(true)
  })

  it('includes synthetic=true in metadata', () => {
    const result = syntheticDefaultLocation('https://mystore.vnda.com.br')
    expect((result.metadata as Record<string, unknown>)['synthetic']).toBe(true)
  })

  it('produces a payload satisfying LocationSchema', () => {
    const result = syntheticDefaultLocation('https://mystore.vnda.com.br')
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
