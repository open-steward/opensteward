import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWooCommerceVariationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/xt-commerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeStock(
  overrides: Partial<RawWooCommerceVariationStock> = {},
): RawWooCommerceVariationStock {
  return {
    id: 88,
    stock_quantity: 50,
    manage_stock: true,
    stock_status: 'instock',
    date_modified_gmt: '2024-06-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (xt-commerce)', () => {
  it('synthesises variantId as productId:variationId', () => {
    const result = transformInventoryLevel(makeStock(), 'prod-99')
    expect(result.variantId).toBe('prod-99:88')
  })

  it('synthesises id as variantId:default', () => {
    const result = transformInventoryLevel(makeStock(), 'prod-99')
    expect(result.id).toBe('prod-99:88:default')
  })

  it('uses sentinel locationId "default"', () => {
    const result = transformInventoryLevel(makeStock(), 'prod-99')
    expect(result.locationId).toBe('default')
  })

  it('maps stock_quantity to available', () => {
    const result = transformInventoryLevel(makeStock({ stock_quantity: 42 }), 'prod-99')
    expect(result.available).toBe(42)
  })

  it('defaults available to 0 when stock_quantity is null', () => {
    const result = transformInventoryLevel(makeStock({ stock_quantity: null }), 'prod-99')
    expect(result.available).toBe(0)
  })

  it('maps date_modified_gmt to updatedAt', () => {
    const result = transformInventoryLevel(makeStock(), 'prod-99')
    expect(result.updatedAt).toBe('2024-06-15T10:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeStock()
    const result = transformInventoryLevel(raw, 'prod-99')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeStock(), 'prod-99')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
