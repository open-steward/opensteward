import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  transformV3InventoryLevels,
  WISH_LOCATION_ID,
  type RawWishInventoryVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/wish/transform/inventory'
import type { RawWishV3Variation } from '../../../../../../../src/verticals/ecommerce/adapters/wish/transform/product'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeVariant(overrides: Partial<RawWishInventoryVariant> = {}): RawWishInventoryVariant {
  return {
    id: 'var-456',
    sku: 'SKU-ABC',
    inventory: 42,
    last_updated: '2024-06-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Wish)', () => {
  it('synthesises id as variantId:wish', () => {
    const result = transformInventoryLevel(makeVariant())
    expect(result.id).toBe('var-456:wish')
  })

  it('maps id field to variantId', () => {
    const result = transformInventoryLevel(makeVariant())
    expect(result.variantId).toBe('var-456')
  })

  it('uses sentinel locationId "wish"', () => {
    const result = transformInventoryLevel(makeVariant())
    expect(result.locationId).toBe(WISH_LOCATION_ID)
    expect(result.locationId).toBe('wish')
  })

  it('maps inventory to available', () => {
    const result = transformInventoryLevel(makeVariant({ inventory: 100 }))
    expect(result.available).toBe(100)
  })

  it('defaults available to 0 when inventory is missing', () => {
    const result = transformInventoryLevel(makeVariant({ inventory: undefined }))
    expect(result.available).toBe(0)
  })

  it('falls back to sku when id is missing', () => {
    const result = transformInventoryLevel(makeVariant({ id: undefined, sku: 'MY-SKU' }))
    expect(result.variantId).toBe('MY-SKU')
    expect(result.id).toBe('MY-SKU:wish')
  })

  it('maps last_updated ISO string to updatedAt', () => {
    const result = transformInventoryLevel(makeVariant())
    expect(result.updatedAt).toBe('2024-06-15T10:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariant()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeVariant())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

// ── API v3 ───────────────────────────────────────────────────────────────────
//
// `ProductVariation.inventories`: "The inventory of the variation in each
// warehouse."; each `WarehouseInventory` is required ["warehouse_id",
// "inventory"] (first-party OpenAPI behind
// https://merchant.wish.com/documentation/api/v3/reference).

describe('transformV3InventoryLevels (Wish v3)', () => {
  const variation: RawWishV3Variation = {
    id: '5d30f60e0a6fc464f4f376d3',
    sku: 'BW-BLUE-M',
    price: { amount: 10.4, currency_code: 'USD' },
    inventories: [
      { warehouse_id: '5d30f60e0a6fc464f4f37600', inventory: 7 },
      { warehouse_id: '5d30f60e0a6fc464f4f37601', inventory: 0 },
    ],
  }

  it('emits one level per warehouse, each satisfying InventoryLevelSchema', () => {
    const levels = transformV3InventoryLevels(variation).map((l) => InventoryLevelSchema.parse(l))
    expect(levels).toEqual([
      {
        id: '5d30f60e0a6fc464f4f376d3:5d30f60e0a6fc464f4f37600',
        variantId: '5d30f60e0a6fc464f4f376d3',
        locationId: '5d30f60e0a6fc464f4f37600',
        available: 7,
        metadata: { warehouse_id: '5d30f60e0a6fc464f4f37600', inventory: 7 },
      },
      {
        id: '5d30f60e0a6fc464f4f376d3:5d30f60e0a6fc464f4f37601',
        variantId: '5d30f60e0a6fc464f4f376d3',
        locationId: '5d30f60e0a6fc464f4f37601',
        available: 0,
        metadata: { warehouse_id: '5d30f60e0a6fc464f4f37601', inventory: 0 },
      },
    ])
  })

  it('emits nothing for a variation without inventories', () => {
    expect(transformV3InventoryLevels({ ...variation, inventories: undefined })).toEqual([])
  })

  it('throws on a variation without an id', () => {
    expect(() => transformV3InventoryLevels({ ...variation, id: undefined })).toThrow(/no id/)
  })
})
