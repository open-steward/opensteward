import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/wbuy/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation (wbuy)', () => {
  it('builds a synthetic "default" location tagged with the site URL', () => {
    const loc = syntheticDefaultLocation('https://mystore.example.com')
    expect(loc.id).toBe('default')
    expect(loc.name).toBe('https://mystore.example.com')
    expect(loc.active).toBe(true)
    expect(loc.isFulfillmentCenter).toBe(true)
  })

  it('marks the metadata as synthetic with a reason', () => {
    const loc = syntheticDefaultLocation('https://mystore.example.com')
    expect((loc.metadata as { synthetic?: boolean }).synthetic).toBe(true)
    expect((loc.metadata as { reason?: string }).reason).toMatch(
      /multi-location/i,
    )
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const loc = syntheticDefaultLocation('https://mystore.example.com')
    expect(() => LocationSchema.parse(loc)).not.toThrow()
  })
})
