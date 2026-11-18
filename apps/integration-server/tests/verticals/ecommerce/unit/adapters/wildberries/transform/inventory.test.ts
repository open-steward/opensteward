import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWooCommerceVariationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/wildberries/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeVariationStock(
  overrides: Partial<RawWooCommerceVariationStock> = {},
): RawWooCommerceVariationStock {
  return {
    id: 101,
    stock_quantity: 25,
    manage_stock: true,
    stock_status: 'instock',
    date_modified_gmt: '2024-05-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (Wildberries/WooCommerce)', () => {
  it('builds canonical id as variantId:default', () => {
    const result = transformInventoryLevel(makeVariationStock(), '42')
    expect(result.id).toBe('42:101:default')
  })

  it('sets variantId as productId:variationId', () => {
    const result = transformInventoryLevel(makeVariationStock(), '42')
    expect(result.variantId).toBe('42:101')
  })

  it('sets locationId to "default"', () => {
    const result = transformInventoryLevel(makeVariationStock(), '42')
    expect(result.locationId).toBe('default')
  })

  it('maps stock_quantity to available', () => {
    const result = transformInventoryLevel(makeVariationStock({ stock_quantity: 15 }), '42')
    expect(result.available).toBe(15)
  })

  it('defaults available to 0 when stock_quantity is null', () => {
    const result = transformInventoryLevel(makeVariationStock({ stock_quantity: null }), '42')
    expect(result.available).toBe(0)
  })

  it('defaults available to 0 when stock_quantity is undefined', () => {
    const result = transformInventoryLevel(makeVariationStock({ stock_quantity: undefined }), '42')
    expect(result.available).toBe(0)
  })

  it('maps updatedAt from date_modified_gmt', () => {
    const result = transformInventoryLevel(makeVariationStock(), '42')
    expect(result.updatedAt).toBe('2024-05-01T00:00:00Z')
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    expect(() =>
      InventoryLevelSchema.parse(transformInventoryLevel(makeVariationStock(), '42')),
    ).not.toThrow()
  })

  it('preserves raw variation in metadata', () => {
    const raw = makeVariationStock()
    const result = transformInventoryLevel(raw, '42')
    expect(result.metadata).toBe(raw)
  })
})
