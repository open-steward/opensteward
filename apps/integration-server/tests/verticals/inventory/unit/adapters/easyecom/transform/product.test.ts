import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawEasyEcomProduct,
} from '../../../../../../../src/verticals/inventory/adapters/easyecom/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('easyecom transformProduct', () => {
  const raw: RawEasyEcomProduct = {
    product_id: 'PROD-001',
    sku: 'SKU-001',
    product_name: 'Cotton Kurta',
    description: 'Comfortable daily wear',
    barcode: '8901234567890',
    brand: 'FashionBrand',
    category: 'Apparel',
    sub_category: 'Ethnic Wear',
    product_type: 'physical',
    weight: 0.3,
    length: 60,
    width: 45,
    height: 2,
    mrp: 599,
    selling_price: 499,
    currency: 'INR',
    is_active: true,
    parent_sku: 'SKU-PARENT',
    vendor_id: 'VEN-001',
    vendor_name: 'Textile Supplier Co',
    created_at: '2024-03-01T00:00:00.000Z',
    updated_at: '2024-03-01T00:00:00.000Z',
  }

  it('maps id and externalId from product_id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('PROD-001')
    expect(result.externalId).toBe('PROD-001')
  })

  it('maps sku from sku field', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('SKU-001')
  })

  it('maps name from product_name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Cotton Kurta')
  })

  it('maps description from description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Comfortable daily wear')
  })

  it('maps upc from barcode', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('8901234567890')
  })

  it('maps brand from brand', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('FashionBrand')
  })

  it('maps category from category', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Apparel')
  })

  it('hardcodes unitOfMeasure to each', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts weight kg to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(300)
  })

  it('maps dimensionsCm from length/width/height', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBe(60)
    expect(result.dimensionsCm?.width).toBe(45)
    expect(result.dimensionsCm?.height).toBe(2)
  })

  it('converts mrp to minor units for retailPrice.amount', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(59900)
    expect(result.retailPrice?.currency).toBe('INR')
  })

  it('maps isActive from is_active', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps parentProductId from parent_sku', () => {
    const result = transformProduct(raw)
    expect(result.parentProductId).toBe('SKU-PARENT')
  })

  it('maps supplierIds from vendor_id', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['VEN-001'])
  })

  it('maps createdAt from created_at', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt from updated_at', () => {
    const result = transformProduct(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to easyecom', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('easyecom')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
