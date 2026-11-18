import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawCloverItemStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/clover/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(overrides: Partial<RawCloverItemStock> = {}): RawCloverItemStock {
  return {
    item: { id: 'ITEM_001' },
    quantity: 42,
    modifiedTime: 1706745600000,
    ...overrides,
  }
}

describe('transformInventoryLevel (Clover)', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeStock(), 'MERCH_001')
    expect(result.id).toBe('ITEM_001:MERCH_001')
    expect(result.variantId).toBe('ITEM_001')
    expect(result.locationId).toBe('MERCH_001')
    expect(result.available).toBe(42)
  })

  it('maps timestamp', () => {
    const result = transformInventoryLevel(makeStock(), 'MERCH_001')
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw, 'MERCH_001')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock(), 'MERCH_001')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('defaults to 0 when quantity is missing', () => {
    const result = transformInventoryLevel(makeStock({ quantity: undefined }), 'MERCH_001')
    expect(result.available).toBe(0)
  })
})
