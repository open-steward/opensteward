import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWooCommerceVariationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/fnac-marketplace/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(
  overrides: Partial<RawWooCommerceVariationStock> = {},
): RawWooCommerceVariationStock {
  return {
    id: 201,
    stock_quantity: 15,
    manage_stock: true,
    stock_status: 'instock',
    date_modified_gmt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (FNAC/WooCommerce)', () => {
  it('synthesises composite id as productId:variantId:default', () => {
    const result = transformInventoryLevel(makeRaw(), '101')
    expect(result.id).toBe('101:201:default')
  })

  it('maps variantId as productId:variationId', () => {
    const result = transformInventoryLevel(makeRaw(), '101')
    expect(result.variantId).toBe('101:201')
  })

  it('maps locationId to "default"', () => {
    const result = transformInventoryLevel(makeRaw(), '101')
    expect(result.locationId).toBe('default')
  })

  it('maps available from stock_quantity', () => {
    const result = transformInventoryLevel(makeRaw({ stock_quantity: 15 }), '101')
    expect(result.available).toBe(15)
  })

  it('defaults available to 0 when stock_quantity is null', () => {
    const result = transformInventoryLevel(makeRaw({ stock_quantity: null }), '101')
    expect(result.available).toBe(0)
  })

  it('maps updatedAt from date_modified_gmt', () => {
    const result = transformInventoryLevel(makeRaw(), '101')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeRaw()
    const result = transformInventoryLevel(raw, '101')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeRaw(), '101')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
