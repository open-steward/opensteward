import { describe, it, expect } from 'vitest'
import {
  transformLocation,
  untransformLocation,
  type RawVendureStockLocation,
} from '../../../../../../../src/verticals/ecommerce/adapters/vendure/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

function makeLocation(overrides: Partial<RawVendureStockLocation> = {}): RawVendureStockLocation {
  return {
    id: '1',
    name: 'Main Warehouse',
    description: 'Primary fulfillment center',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-15T12:00:00Z',
    ...overrides,
  }
}

describe('transformLocation (Vendure)', () => {
  it('maps core fields', () => {
    const result = transformLocation(makeLocation())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Main Warehouse')
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

  it('round-trips via untransformLocation', () => {
    const canonical = transformLocation(makeLocation())
    const raw = untransformLocation(canonical)
    expect(raw['name']).toBe('Main Warehouse')
  })
})
