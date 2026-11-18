import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawVendureStockLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/vendure/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStockLevel(overrides: Partial<RawVendureStockLevel> = {}): RawVendureStockLevel {
  return {
    stockLocationId: 'LOC1',
    stockOnHand: 100,
    stockAllocated: 15,
    ...overrides,
  }
}

describe('transformInventoryLevel (Vendure)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeStockLevel(), 'V1')
    expect(result.id).toBe('V1:LOC1')
    expect(result.variantId).toBe('V1')
    expect(result.locationId).toBe('LOC1')
    expect(result.available).toBe(85)
    expect(result.committed).toBe(15)
    expect(result.onHand).toBe(100)
  })

  it('handles zero allocated', () => {
    const result = transformInventoryLevel(
      makeStockLevel({ stockAllocated: 0 }),
      'V2',
    )
    expect(result.available).toBe(100)
    expect(result.committed).toBe(0)
  })

  it('handles missing stockAllocated', () => {
    const result = transformInventoryLevel(
      makeStockLevel({ stockAllocated: undefined }),
      'V3',
    )
    expect(result.available).toBe(100)
    expect(result.committed).toBe(0)
  })

  it('uses stockLocation.id when stockLocationId is missing', () => {
    const result = transformInventoryLevel(
      { stockOnHand: 50, stockLocation: { id: 'LOC2' } },
      'V4',
    )
    expect(result.locationId).toBe('LOC2')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStockLevel()
    const result = transformInventoryLevel(raw, 'V1')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStockLevel(), 'V1')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
