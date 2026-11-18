import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawSquareInventoryCount,
} from '../../../../../../../src/verticals/ecommerce/adapters/square/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeCount(overrides: Partial<RawSquareInventoryCount> = {}): RawSquareInventoryCount {
  return {
    catalog_object_id: 'VAR_001',
    catalog_object_type: 'ITEM_VARIATION',
    location_id: 'LOC_MAIN',
    quantity: '25',
    state: 'IN_STOCK',
    calculated_at: '2024-03-15T08:30:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Square)', () => {
  it('maps fields and synthesises composite id', () => {
    const result = transformInventoryLevel(makeCount())
    expect(result.id).toBe('VAR_001:LOC_MAIN')
    expect(result.variantId).toBe('VAR_001')
    expect(result.locationId).toBe('LOC_MAIN')
    expect(result.available).toBe(25)
    expect(result.updatedAt).toBe('2024-03-15T08:30:00Z')
  })

  it('parses string quantity to number', () => {
    const result = transformInventoryLevel(makeCount({ quantity: '7.5' }))
    expect(result.available).toBe(7.5)
  })

  it('defaults undefined quantity to 0', () => {
    const result = transformInventoryLevel(makeCount({ quantity: undefined }))
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCount()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeCount())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
