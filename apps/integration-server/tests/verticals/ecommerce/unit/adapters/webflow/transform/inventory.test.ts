import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWebflowInventory,
} from '../../../../../../../src/verticals/ecommerce/adapters/webflow/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(overrides: Partial<RawWebflowInventory> = {}): RawWebflowInventory {
  return {
    _id: 'inv_001',
    quantity: 42,
    inventoryType: 'finite',
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('maps core fields', () => {
    const result = transformInventoryLevel(makeInventory(), 'sku_001', 'site_abc')
    expect(result.id).toBe('inv_001')
    expect(result.variantId).toBe('sku_001')
    expect(result.locationId).toBe('site_abc')
    expect(result.available).toBe(42)
  })

  it('defaults available to 0 when quantity is null', () => {
    const result = transformInventoryLevel(makeInventory({ quantity: undefined }), 'sku_002', 'site_abc')
    expect(result.available).toBe(0)
  })

  it('synthesises id when _id is missing', () => {
    const result = transformInventoryLevel(
      makeInventory({ _id: undefined }),
      'sku_003',
      'site_xyz',
    )
    expect(result.id).toBe('sku_003:site_xyz')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeInventory()
    const result = transformInventoryLevel(raw, 'sku_001', 'site_abc')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventory(), 'sku_001', 'site_abc')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
