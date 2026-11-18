/**
 * Fixtures follow the StockManagement OpenAPI embedded in
 * https://docs.brinkcommerce.com/technical/api-references/management/stock/product-variant-inventories.md:
 * the stock `ProductVariant` { id, inventories, stockQuantity, validateStock }
 * from GET /product-variants/{productVariantId}, and `ProductVariantInventory`
 * { inventoryId, productVariantId, quantity } from the PUT.
 */
import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  transformVariantStock,
  type RawBrinkVariantStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/brink-commerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

const stock: RawBrinkVariantStock = {
  id: 'tee-blue-m',
  validateStock: true,
  stockQuantity: 17,
  inventories: [
    {
      inventoryId: 'stockholm-wh',
      quantity: 12,
      created: '2024-01-01T00:00:00Z',
      updated: '2024-03-01T09:00:00Z',
    },
    {
      inventoryId: 'oslo-store',
      quantity: 5,
      created: '2024-01-01T00:00:00Z',
      updated: '2024-03-02T09:00:00Z',
    },
  ],
}

describe('transformVariantStock (brink-commerce)', () => {
  it('emits one level per inventory, each parsing against InventoryLevelSchema', () => {
    const levels = transformVariantStock(stock)
    expect(levels).toHaveLength(2)
    for (const level of levels) expect(() => InventoryLevelSchema.parse(level)).not.toThrow()
  })

  it('keys levels by variant and inventory id', () => {
    expect(transformVariantStock(stock)[1]).toMatchObject({
      id: 'tee-blue-m:oslo-store',
      variantId: 'tee-blue-m',
      locationId: 'oslo-store',
      available: 5,
      updatedAt: '2024-03-02T09:00:00.000Z',
    })
  })

  it('returns no levels for a variant stocked nowhere', () => {
    expect(transformVariantStock({ ...stock, inventories: [] })).toEqual([])
  })
})

describe('transformInventoryLevel (brink-commerce)', () => {
  it('maps a ProductVariantInventory and parses against InventoryLevelSchema', () => {
    const out = transformInventoryLevel({
      inventoryId: 'stockholm-wh',
      productVariantId: 'tee-blue-m',
      quantity: 9,
    })
    expect(InventoryLevelSchema.parse(out)).toMatchObject({
      id: 'tee-blue-m:stockholm-wh',
      variantId: 'tee-blue-m',
      locationId: 'stockholm-wh',
      available: 9,
    })
  })
})
