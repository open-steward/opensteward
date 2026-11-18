import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/recharge/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation', () => {
  it('returns a location with id "default"', () => {
    const result = syntheticDefaultLocation()
    expect(result.id).toBe('default')
  })

  it('has the expected name', () => {
    const result = syntheticDefaultLocation()
    expect(result.name).toBe('Recharge (default)')
  })

  it('is always active and not a fulfillment center', () => {
    const result = syntheticDefaultLocation()
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(false)
  })

  it('marks metadata as synthetic', () => {
    const result = syntheticDefaultLocation()
    expect(result.metadata?.synthetic).toBe(true)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = syntheticDefaultLocation()
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
