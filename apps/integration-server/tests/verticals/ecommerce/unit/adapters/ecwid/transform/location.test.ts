import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/ecwid/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation (Ecwid)', () => {
  it('returns a synthetic default location with the store id', () => {
    const loc = syntheticDefaultLocation('12345')
    expect(loc.id).toBe('default')
    expect(loc.name).toBe('Ecwid Store 12345')
    expect(loc.active).toBe(true)
    expect(loc.isFulfillmentCenter).toBe(true)
    expect((loc.metadata as { synthetic: boolean }).synthetic).toBe(true)
  })

  it('produces a schema-valid result', () => {
    const loc = syntheticDefaultLocation('12345')
    expect(() => LocationSchema.parse(loc)).not.toThrow()
  })
})
