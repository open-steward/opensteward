import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShoplineInventoryLevel,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopline/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(overrides: Partial<RawShoplineInventoryLevel> = {}): RawShoplineInventoryLevel {
  return {
    inventory_item_id: 111,
    location_id: 222,
    available: 42,
    variant_id: 333,
    updated_at: '2024-01-15T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('synthesises composite id from inventory_item_id and location_id', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.id).toBe('111:222')
    expect(result.locationId).toBe('222')
  })

  it('prefers variant_id over inventory_item_id for variantId', () => {
    const result = transformInventoryLevel(makeRaw({ variant_id: 999 }))
    expect(result.variantId).toBe('999')
  })

  it('falls back to inventory_item_id when variant_id is absent', () => {
    const result = transformInventoryLevel(makeRaw({ variant_id: null }))
    expect(result.variantId).toBe('111')
  })

  it('maps available and updatedAt', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(result.available).toBe(42)
    expect(result.updatedAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('treats null available as 0', () => {
    const result = transformInventoryLevel(makeRaw({ available: null }))
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRaw()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeRaw())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
