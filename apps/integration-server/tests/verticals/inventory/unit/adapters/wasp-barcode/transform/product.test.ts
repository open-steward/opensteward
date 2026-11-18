import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawWaspBarcodeProduct,
} from '../../../../../../../src/verticals/inventory/adapters/wasp-barcode/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

const rawProduct: RawWaspBarcodeProduct = {
  ItemNumber: 'ITEM-001',
  ItemName: 'Widget Blue',
  Description: 'A blue widget for testing',
  UPC: '012345678905',
  Category: 'Widgets',
  UOM: 'each',
  UnitPrice: 9.99,
  Weight: 1.0, // 1 lb → 454g rounded
  IsActive: true,
  VendorNumber: 'VEN-42',
  DateCreated: '2024-03-01T00:00:00Z',
  DateModified: '2024-03-01T00:00:00Z',
}

describe('wasp-barcode transformProduct', () => {
  it('maps ItemNumber to id and sku', () => {
    const result = transformProduct(rawProduct)
    expect(result.id).toBe('ITEM-001')
    expect(result.sku).toBe('ITEM-001')
  })

  it('maps ItemName to name', () => {
    const result = transformProduct(rawProduct)
    expect(result.name).toBe('Widget Blue')
  })

  it('maps Description to description', () => {
    const result = transformProduct(rawProduct)
    expect(result.description).toBe('A blue widget for testing')
  })

  it('maps UPC to upc', () => {
    const result = transformProduct(rawProduct)
    expect(result.upc).toBe('012345678905')
  })

  it('converts weight from pounds to grams (1 lb ≈ 454g)', () => {
    const result = transformProduct(rawProduct)
    expect(result.weightGrams).toBe(Math.round(1.0 * 453.592))
  })

  it('maps VendorNumber into supplierIds', () => {
    const result = transformProduct(rawProduct)
    expect(result.supplierIds).toContain('VEN-42')
  })

  it('maps IsActive to isActive', () => {
    const result = transformProduct(rawProduct)
    expect(result.isActive).toBe(true)
  })

  it('maps DateCreated to createdAt as ISO string', () => {
    const result = transformProduct(rawProduct)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform=wasp-barcode', () => {
    const result = transformProduct(rawProduct)
    expect(result.platform).toBe('wasp-barcode')
  })

  it('produces a schema-valid Product', () => {
    const result = transformProduct(rawProduct)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('defaults unitOfMeasure to "each" when UOM absent', () => {
    const result = transformProduct({ ItemNumber: 'X', ItemName: 'X' })
    expect(result.unitOfMeasure).toBe('each')
  })

  it('defaults supplierIds to [] when no VendorNumber', () => {
    const result = transformProduct({ ItemNumber: 'X', ItemName: 'X' })
    expect(result.supplierIds).toEqual([])
  })
})
