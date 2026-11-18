import { describe, it, expect } from 'vitest'
import { syntheticDefaultLocation } from '../../../../../../../src/verticals/ecommerce/adapters/quickbutik/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticDefaultLocation', () => {
  it('returns id "default"', () => {
    const result = syntheticDefaultLocation()
    expect(result.id).toBe('default')
  })

  it('returns name "Quickbutik Store"', () => {
    const result = syntheticDefaultLocation()
    expect(result.name).toBe('Quickbutik Store')
  })

  it('returns active:true', () => {
    const result = syntheticDefaultLocation()
    expect(result.active).toBe(true)
  })

  it('returns isFulfillmentCenter:true', () => {
    const result = syntheticDefaultLocation()
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('marks location as synthetic in metadata', () => {
    const result = syntheticDefaultLocation()
    expect(result.metadata['synthetic']).toBe(true)
  })

  it('each call returns a new object (no shared mutable state)', () => {
    const a = syntheticDefaultLocation()
    const b = syntheticDefaultLocation()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = syntheticDefaultLocation()
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
