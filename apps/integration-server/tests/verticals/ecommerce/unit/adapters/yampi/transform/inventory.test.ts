import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWooCommerceVariationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/yampi/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeVariation(
  overrides: Partial<RawWooCommerceVariationStock> = {},
): RawWooCommerceVariationStock {
  return {
    id: 55,
    stock_quantity: 10,
    manage_stock: true,
    stock_status: 'instock',
    date_modified_gmt: '2024-05-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Yampi/WooCommerce)', () => {
  it('builds composite id as {productId}:{variationId}:default', () => {
    const result = transformInventoryLevel(makeVariation(), '42')
    expect(result.id).toBe('42:55:default')
  })

  it('sets variantId as {productId}:{variationId}', () => {
    const result = transformInventoryLevel(makeVariation(), '42')
    expect(result.variantId).toBe('42:55')
  })

  it('sets locationId to "default"', () => {
    const result = transformInventoryLevel(makeVariation(), '42')
    expect(result.locationId).toBe('default')
  })

  it('maps stock_quantity to available', () => {
    const result = transformInventoryLevel(makeVariation({ stock_quantity: 25 }), '42')
    expect(result.available).toBe(25)
  })

  it('defaults available to 0 when stock_quantity is null', () => {
    const result = transformInventoryLevel(makeVariation({ stock_quantity: null }), '42')
    expect(result.available).toBe(0)
  })

  it('maps updatedAt from date_modified_gmt', () => {
    const result = transformInventoryLevel(makeVariation(), '42')
    expect(result.updatedAt).toBe('2024-05-01T00:00:00Z')
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    expect(() =>
      InventoryLevelSchema.parse(transformInventoryLevel(makeVariation(), '42')),
    ).not.toThrow()
  })
})
