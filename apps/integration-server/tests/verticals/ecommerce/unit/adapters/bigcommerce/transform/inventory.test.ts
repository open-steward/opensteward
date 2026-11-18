import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  transformVariantInventory,
  type RawBigCommerceInventoryItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcommerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeItem(overrides: Partial<RawBigCommerceInventoryItem> = {}): RawBigCommerceInventoryItem {
  return {
    variant_id: 201,
    product_id: 112,
    location_id: 1,
    available_stock: 25,
    total_stock: 30,
    ...overrides,
  }
}

describe('transformInventoryLevel', () => {
  it('maps fields and synthesises the composite id', () => {
    const result = transformInventoryLevel(makeItem())
    expect(result.id).toBe('201:1')
    expect(typeof result.id).toBe('string')
    expect(result.variantId).toBe('201')
    expect(result.locationId).toBe('1')
    expect(result.available).toBe(25)
  })

  it('defaults undefined available_stock to 0', () => {
    const result = transformInventoryLevel(makeItem({ available_stock: undefined }))
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeItem()
    const result = transformInventoryLevel(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeItem())
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariantInventory', () => {
  it('builds an inventory level from variant-level data', () => {
    const result = transformVariantInventory(201, 15, '1')
    expect(result.id).toBe('201:1')
    expect(result.variantId).toBe('201')
    expect(result.locationId).toBe('1')
    expect(result.available).toBe(15)
  })

  it('defaults locationId to "default"', () => {
    const result = transformVariantInventory(201, 10)
    expect(result.locationId).toBe('default')
  })

  it('satisfies InventoryLevelSchema', () => {
    const result = transformVariantInventory(201, 10)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
