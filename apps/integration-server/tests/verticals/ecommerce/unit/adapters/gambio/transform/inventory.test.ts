import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWooCommerceVariationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/gambio/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeVariationStock(
  overrides: Partial<RawWooCommerceVariationStock> = {},
): RawWooCommerceVariationStock {
  return {
    id: 1111,
    stock_quantity: 25,
    manage_stock: true,
    stock_status: 'instock',
    date_modified_gmt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Gambio / WooCommerce)', () => {
  it('synthesises id as variantId:default', () => {
    const result = transformInventoryLevel(makeVariationStock(), '500')
    expect(result.id).toBe('500:1111:default')
    expect(result.variantId).toBe('500:1111')
    expect(result.locationId).toBe('default')
  })

  it('maps available from stock_quantity', () => {
    const result = transformInventoryLevel(makeVariationStock({ stock_quantity: 42 }), '500')
    expect(result.available).toBe(42)
  })

  it('defaults available to 0 when stock_quantity is null', () => {
    const result = transformInventoryLevel(makeVariationStock({ stock_quantity: null }), '500')
    expect(result.available).toBe(0)
  })

  it('maps updatedAt from date_modified_gmt', () => {
    const result = transformInventoryLevel(makeVariationStock(), '500')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariationStock()
    const result = transformInventoryLevel(raw, '500')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    const result = transformInventoryLevel(makeVariationStock(), '500')
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
