import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWooCommerceVariationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/ankorstore/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeVariationStock(
  overrides: Partial<RawWooCommerceVariationStock> = {},
): RawWooCommerceVariationStock {
  return {
    id: 5,
    stock_quantity: 20,
    manage_stock: true,
    stock_status: 'instock',
    date_modified_gmt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Ankorstore / WooCommerce)', () => {
  it('synthesises id as ${productId}:${variantId}:default', () => {
    const result = transformInventoryLevel(makeVariationStock({ id: 5 }), 'prod-10')
    expect(result.id).toBe('prod-10:5:default')
  })

  it('synthesises variantId as ${productId}:${variationId}', () => {
    const result = transformInventoryLevel(makeVariationStock({ id: 5 }), 'prod-10')
    expect(result.variantId).toBe('prod-10:5')
  })

  it('hardcodes locationId to "default"', () => {
    const result = transformInventoryLevel(makeVariationStock(), 'prod-1')
    expect(result.locationId).toBe('default')
  })

  it('maps stock_quantity to available', () => {
    const result = transformInventoryLevel(makeVariationStock({ stock_quantity: 42 }), 'p')
    expect(result.available).toBe(42)
  })

  it('uses 0 when stock_quantity is null', () => {
    const result = transformInventoryLevel(makeVariationStock({ stock_quantity: null }), 'p')
    expect(result.available).toBe(0)
  })

  it('maps date_modified_gmt to updatedAt', () => {
    const result = transformInventoryLevel(makeVariationStock(), 'p')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores raw payload in metadata', () => {
    const raw = makeVariationStock()
    const result = transformInventoryLevel(raw, 'p')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeVariationStock(), 'prod-1')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
