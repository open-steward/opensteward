import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawShopeeInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopee/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeInventory(
  overrides: Partial<RawShopeeInventoryItem> = {},
): RawShopeeInventoryItem {
  return {
    item_id: 100200300,
    item_sku: 'WBE-001',
    stock_info_v2: {
      summary_info: {
        total_available_stock: 150,
        total_reserved_stock: 12,
      },
    },
    update_time: 1706745600,
    ...overrides,
  }
}

describe('transformInventoryLevel (Shopee)', () => {
  it('uses item_id as variantId when no model_id', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.variantId).toBe('100200300')
    expect(result.id).toBe('100200300:shopee-default')
    expect(result.locationId).toBe('shopee-default')
  })

  it('uses model_id as variantId when present', () => {
    const result = transformInventoryLevel(makeInventory({ model_id: 50001 }))
    expect(result.variantId).toBe('50001')
    expect(result.id).toBe('50001:shopee-default')
  })

  it('maps available and committed stock', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.available).toBe(150)
    expect(result.committed).toBe(12)
    expect(result.onHand).toBe(162) // 150 + 12
  })

  it('defaults available to 0 when stock_info_v2 is missing', () => {
    const result = transformInventoryLevel(
      makeInventory({ stock_info_v2: undefined }),
    )
    expect(result.available).toBe(0)
    expect(result.committed).toBeUndefined()
    expect(result.onHand).toBeUndefined()
  })

  it('converts update_time to ISO string', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })

  it('preserves raw data in metadata', () => {
    const result = transformInventoryLevel(makeInventory())
    expect(result.metadata['item_id']).toBe(100200300)
    expect(result.metadata['item_sku']).toBe('WBE-001')
  })
})
