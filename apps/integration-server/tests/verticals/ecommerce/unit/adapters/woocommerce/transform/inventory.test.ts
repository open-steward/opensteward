import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWooCommerceVariationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/woocommerce/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeVariationStock(
  overrides: Partial<RawWooCommerceVariationStock> = {},
): RawWooCommerceVariationStock {
  return {
    id: 501,
    stock_quantity: 17,
    manage_stock: true,
    stock_status: 'instock',
    date_modified_gmt: '2024-03-15T08:30:00.000Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (WooCommerce)', () => {
  it('synthesises a composite id and default location', () => {
    const result = transformInventoryLevel(makeVariationStock(), '987654321')
    expect(result.id).toBe('987654321:501:default')
    expect(typeof result.id).toBe('string')
    expect(result.variantId).toBe('987654321:501')
    expect(result.locationId).toBe('default')
    expect(result.available).toBe(17)
    expect(result.updatedAt).toBe('2024-03-15T08:30:00.000Z')
  })

  it('defaults null stock_quantity to 0', () => {
    const result = transformInventoryLevel(
      makeVariationStock({ stock_quantity: null }),
      '987654321',
    )
    expect(result.available).toBe(0)
  })

  it('preserves raw payload in metadata and validates against InventoryLevelSchema', () => {
    const raw = makeVariationStock()
    const result = transformInventoryLevel(raw, '987654321')
    expect(result.metadata).toBe(raw)
    expect(() => InventoryLevelSchema.parse(result)).not.toThrow()
  })
})
