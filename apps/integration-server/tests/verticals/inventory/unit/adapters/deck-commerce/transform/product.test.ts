import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawDeckCommerceProduct,
} from '../../../../../../../src/verticals/inventory/adapters/deck-commerce/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('deck-commerce transformProduct', () => {
  const raw: RawDeckCommerceProduct = {
    SKU: 'DC-SKU-001',
    ItemID: 'item-dc-001',
    ItemName: 'Blue T-Shirt',
    Description: 'Classic blue t-shirt',
    UPC: '012345678901',
    ItemCategory: 'Apparel',
    IsActive: true,
    CreatedDateUTC: '2024-03-01T00:00:00Z',
    LastModifiedDateUTC: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId preferring ItemID over SKU', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('item-dc-001')
    expect(result.externalId).toBe('item-dc-001')
  })

  it('falls back to SKU when ItemID absent', () => {
    const result = transformProduct({ SKU: 'DC-SKU-002' })
    expect(result.id).toBe('DC-SKU-002')
  })

  it('maps sku from SKU field', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('DC-SKU-001')
  })

  it('maps name from ItemName', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Blue T-Shirt')
  })

  it('maps description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Classic blue t-shirt')
  })

  it('maps category from ItemCategory', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Apparel')
  })

  it('hardcodes unitOfMeasure to each', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('maps isActive from IsActive flag', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('defaults isActive to true when absent', () => {
    const result = transformProduct({ SKU: 'DC-SKU-003' })
    expect(result.isActive).toBe(true)
  })

  it('sets no retailPrice (undefined)', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice).toBeUndefined()
  })

  it('maps createdAt from CreatedDateUTC', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to deck-commerce', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('deck-commerce')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
