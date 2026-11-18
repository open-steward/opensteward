import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawLazadaStockItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/lazada/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStockItem(
  overrides: Partial<RawLazadaStockItem> = {},
): RawLazadaStockItem {
  return {
    seller_sku: 'EARBUDS-BLK',
    shop_sku: 'EARBUDS-BLK-SG',
    sku_id: 901,
    sellable_quantity: 95,
    quantity: 100,
    reserved_stock: 5,
    ...overrides,
  }
}

describe('transformInventoryLevel (Lazada)', () => {
  it('uses sku_id as variantId and a synthetic lazada-default location', () => {
    const lvl = transformInventoryLevel(makeStockItem())
    expect(lvl.id).toBe('901:lazada-default')
    expect(lvl.variantId).toBe('901')
    expect(lvl.locationId).toBe('lazada-default')
  })

  it('maps sellable_quantity to available and reserved_stock to committed', () => {
    const lvl = transformInventoryLevel(makeStockItem())
    expect(lvl.available).toBe(95)
    expect(lvl.committed).toBe(5)
    expect(lvl.onHand).toBe(100)
  })

  it('falls back to quantity when sellable_quantity is absent', () => {
    const lvl = transformInventoryLevel(
      makeStockItem({ sellable_quantity: undefined }),
    )
    expect(lvl.available).toBe(100)
  })

  it('handles missing reserved_stock', () => {
    const lvl = transformInventoryLevel(
      makeStockItem({ reserved_stock: undefined }),
    )
    expect(lvl.committed).toBeUndefined()
    expect(lvl.onHand).toBeUndefined()
  })

  it('falls back to seller_sku when sku_id is absent', () => {
    const lvl = transformInventoryLevel(
      makeStockItem({ sku_id: undefined }),
    )
    expect(lvl.variantId).toBe('EARBUDS-BLK')
    expect(lvl.id).toBe('EARBUDS-BLK:lazada-default')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStockItem()
    const lvl = transformInventoryLevel(raw)
    expect(lvl.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const lvl = transformInventoryLevel(makeStockItem())
    expect(() => InventoryLevelSchema.parse(lvl)).not.toThrow()
  })
})
