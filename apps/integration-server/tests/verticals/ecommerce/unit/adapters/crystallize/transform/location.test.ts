import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  type RawCrystallizeStockLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/crystallize/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawCrystallizeStockLocation> = {}): RawCrystallizeStockLocation {
  return {
    identifier: 'warehouse-eu',
    name: 'EU Warehouse',
    settings: { minimum: 5 },
    ...overrides,
  }
}

describe('transformLocation (Crystallize)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('warehouse-eu')
    expect(result.name).toBe('EU Warehouse')
    expect(result.active).toBe(true)
    expect(result.isFulfillmentCenter).toBe(true)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeLocation()
    const result = transformLocation(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const result = transformLocation(makeLocation())
    expect(() => LocationSchema.parse(result)).not.toThrow()
  })
})
