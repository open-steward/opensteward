import { describe, it, expect } from 'vitest'
import {
  transformInventoryLevel,
  type RawWooCommerceVariationStock,
} from '../../../../../../../src/verticals/ecommerce/adapters/hepsiburada/transform/inventory'
import { InventoryLevelSchema } from '../../../../../../../src/verticals/ecommerce/schema/inventory'

function makeRaw(
  overrides: Partial<RawWooCommerceVariationStock> = {},
): RawWooCommerceVariationStock {
  return {
    id: 301,
    stock_quantity: 20,
    manage_stock: true,
    stock_status: 'instock',
    date_modified_gmt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformInventoryLevel (hepsiburada / WooCommerce)', () => {
  it('synthesizes id as variantId:default', () => {
    const result = transformInventoryLevel(makeRaw(), '201')
    // variantId is "201:301" and locationId is "default"
    expect(result.id).toBe('201:301:default')
  })

  it('maps variantId combining productId and variation id', () => {
    const result = transformInventoryLevel(makeRaw(), '201')
    expect(result.variantId).toBe('201:301')
  })

  it('maps locationId to synthetic default', () => {
    const result = transformInventoryLevel(makeRaw(), '201')
    expect(result.locationId).toBe('default')
  })

  it('maps available from stock_quantity', () => {
    const result = transformInventoryLevel(makeRaw(), '201')
    expect(result.available).toBe(20)
  })

  it('defaults available to 0 when stock_quantity is null', () => {
    const result = transformInventoryLevel(makeRaw({ stock_quantity: null }), '201')
    expect(result.available).toBe(0)
  })

  it('maps updatedAt from date_modified_gmt', () => {
    const result = transformInventoryLevel(makeRaw(), '201')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces a payload that satisfies InventoryLevelSchema', () => {
    expect(() =>
      InventoryLevelSchema.parse(transformInventoryLevel(makeRaw(), '201')),
    ).not.toThrow()
  })
})
