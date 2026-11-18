import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawCrystallizeStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/crystallize/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawCrystallizeStock> = {}): RawCrystallizeStock {
  return {
    sku: 'MUG-WHT',
    location: 'warehouse-eu',
    stock: 50,
    variantId: 'var-001',
    ...overrides,
  }
}

describe('transformInventoryLevel (Crystallize)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.variantId).toBe('var-001')
    expect(result.locationId).toBe('warehouse-eu')
    expect(result.available).toBe(50)
    expect(result.onHand).toBe(50)
  })

  it('synthesizes composite id', () => {
    const result = transformInventoryLevel(makeStock())
    expect(result.id).toBe('var-001:warehouse-eu')
  })

  it('uses variantIdOverride', () => {
    const result = transformInventoryLevel(makeStock({ variantId: undefined }), 'var-override')
    expect(result.variantId).toBe('var-override')
    expect(result.id).toBe('var-override:warehouse-eu')
  })

  it('handles zero stock', () => {
    const result = transformInventoryLevel(makeStock({ stock: 0 }))
    expect(result.available).toBe(0)
  })

  it('handles missing stock', () => {
    const result = transformInventoryLevel(makeStock({ stock: undefined }))
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
