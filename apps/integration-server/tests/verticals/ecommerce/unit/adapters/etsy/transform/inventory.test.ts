import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  transformInventoryLevels,
  type RawEtsyInventory,
  type RawEtsyInventoryProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/etsy/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeProduct(
  overrides: Partial<RawEtsyInventoryProduct> = {},
): RawEtsyInventoryProduct {
  return {
    product_id: 9001,
    sku: 'MUG-BLUE-LG',
    offerings: [
      { offering_id: 1001, quantity: 8, is_enabled: true },
      { offering_id: 1002, quantity: 2, is_enabled: true },
    ],
    property_values: [],
    ...overrides,
  }
}

function makeInventory(
  overrides: Partial<RawEtsyInventory> = {},
): RawEtsyInventory {
  return {
    listing_id: 1234567890,
    products: [makeProduct()],
    ...overrides,
  }
}

describe('transformInventoryLevel (Etsy)', () => {
  it('uses listingId:productId as the id and etsy-default as locationId', () => {
    const lvl = transformInventoryLevel('1234567890', makeProduct())
    expect(lvl.id).toBe('1234567890:9001')
    expect(lvl.variantId).toBe('1234567890')
    expect(lvl.locationId).toBe('etsy-default')
  })

  it('sums offering quantities for available count', () => {
    const lvl = transformInventoryLevel('1234567890', makeProduct())
    expect(lvl.available).toBe(10) // 8 + 2
  })

  it('handles empty offerings', () => {
    const lvl = transformInventoryLevel('123', makeProduct({ offerings: [] }))
    expect(lvl.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const lvl = transformInventoryLevel('123', raw)
    expect(lvl.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const lvl = transformInventoryLevel('123', makeProduct())
    expect(() => InventoryLevelSchema.parse(lvl)).not.toThrow()
  })
})

describe('transformInventoryLevels (Etsy)', () => {
  it('transforms all products in the inventory', () => {
    const inv = makeInventory({
      products: [
        makeProduct({ product_id: 1 }),
        makeProduct({ product_id: 2 }),
      ],
    })
    const levels = transformInventoryLevels('1234567890', inv)
    expect(levels).toHaveLength(2)
    expect(levels[0]!.id).toBe('1234567890:1')
    expect(levels[1]!.id).toBe('1234567890:2')
  })

  it('returns empty array when no products', () => {
    const levels = transformInventoryLevels('123', { products: [] })
    expect(levels).toEqual([])
  })
})
