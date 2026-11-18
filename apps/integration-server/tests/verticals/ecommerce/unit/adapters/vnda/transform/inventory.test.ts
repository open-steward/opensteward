import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWooCommerceVariationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/vnda/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeVariationStock(
  overrides: Partial<RawWooCommerceVariationStock> = {},
): RawWooCommerceVariationStock {
  return {
    id: 500,
    stock_quantity: 42,
    manage_stock: true,
    stock_status: 'instock',
    date_modified_gmt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (VNDA/WooCommerce)', () => {
  it('synthesizes id as productId:variantId:default', () => {
    const result = transformInventoryLevel(makeVariationStock(), '100')
    expect(result.id).toBe('100:500:default')
  })

  it('synthesizes variantId as productId:variationId', () => {
    const result = transformInventoryLevel(makeVariationStock(), '100')
    expect(result.variantId).toBe('100:500')
  })

  it('always uses default as locationId', () => {
    const result = transformInventoryLevel(makeVariationStock(), '100')
    expect(result.locationId).toBe('default')
  })

  it('maps stock_quantity to available', () => {
    const result = transformInventoryLevel(makeVariationStock({ stock_quantity: 42 }), '100')
    expect(result.available).toBe(42)
  })

  it('defaults available to 0 when stock_quantity is null', () => {
    const result = transformInventoryLevel(makeVariationStock({ stock_quantity: null }), '100')
    expect(result.available).toBe(0)
  })

  it('maps updatedAt from date_modified_gmt', () => {
    const result = transformInventoryLevel(makeVariationStock(), '100')
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariationStock()
    const result = transformInventoryLevel(raw, '100')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeVariationStock(), '100')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
