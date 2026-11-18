import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawDarazStockItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/daraz/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(
  overrides: Partial<RawDarazStockItem> = {},
): RawDarazStockItem {
  return {
    seller_sku: 'EARBUDS-BLK',
    shop_sku: 'EARBUDS-BLK-PK',
    sku_id: 901,
    sellable_quantity: 95,
    quantity: 100,
    reserved_stock: 5,
    ...overrides,
  }
}

describe('transformInventoryLevel (Daraz)', () => {
  it('uses sku_id as variantId and a synthetic daraz-default location', () => {
    const lvl = transformInventoryLevel(makeRaw())
    expect(lvl.id).toBe('901:daraz-default')
    expect(lvl.variantId).toBe('901')
    expect(lvl.locationId).toBe('daraz-default')
  })

  it('maps sellable_quantity to available and reserved_stock to committed', () => {
    const lvl = transformInventoryLevel(makeRaw())
    expect(lvl.available).toBe(95)
    expect(lvl.committed).toBe(5)
    expect(lvl.onHand).toBe(100)
  })

  it('falls back to quantity when sellable_quantity is absent', () => {
    const lvl = transformInventoryLevel(
      makeRaw({ sellable_quantity: undefined }),
    )
    expect(lvl.available).toBe(100)
  })

  it('handles missing reserved_stock', () => {
    const lvl = transformInventoryLevel(
      makeRaw({ reserved_stock: undefined }),
    )
    expect(lvl.committed).toBeUndefined()
    expect(lvl.onHand).toBeUndefined()
  })

  it('falls back to seller_sku when sku_id is absent', () => {
    const lvl = transformInventoryLevel(
      makeRaw({ sku_id: undefined }),
    )
    expect(lvl.variantId).toBe('EARBUDS-BLK')
    expect(lvl.id).toBe('EARBUDS-BLK:daraz-default')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRaw()
    const lvl = transformInventoryLevel(raw)
    expect(lvl.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const lvl = transformInventoryLevel(makeRaw())
    expect(() => InventoryLevelSchema.parse(lvl)).not.toThrow()
  })

  it('defaults to zero when both sellable_quantity and quantity are absent', () => {
    const lvl = transformInventoryLevel(
      makeRaw({ sellable_quantity: undefined, quantity: undefined }),
    )
    expect(lvl.available).toBe(0)
  })
})
