import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSkusavvyProduct,
} from '../../../../../../../src/verticals/inventory/adapters/skusavvy/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('skusavvy transformProduct', () => {
  const raw: RawSkusavvyProduct = {
    id: 'prod-01',
    sku: 'WK-2026',
    name: 'Wireless Keyboard',
    description: 'Bluetooth keyboard',
    barcode: '0123456789012',
    brand: 'Keyboards Inc',
    productType: 'Peripherals',
    weight: 500,
    weightUnit: 'g',
    price: 4999,
    active: true,
    vendorId: 'vendor-42',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
  }

  it('maps id, sku, and name', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-01')
    expect(result.sku).toBe('WK-2026')
    expect(result.name).toBe('Wireless Keyboard')
    expect(result.platform).toBe('skusavvy')
  })

  it('maps weight in grams directly', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(500)
  })

  it('converts weight in lbs to grams', () => {
    const result = transformProduct({ ...raw, weight: 1, weightUnit: 'lb' })
    // 1 lb → 1 * 453.592 = 453.592
    expect(result.weightGrams).toBeCloseTo(453.592, 1)
  })

  it('converts weight in kg to grams', () => {
    const result = transformProduct({ ...raw, weight: 2, weightUnit: 'kg' })
    expect(result.weightGrams).toBe(2000)
  })

  it('converts price (decimal dollars) to integer cents for retailPrice', () => {
    // price=4999 → Math.round(4999 * 100) = 499900
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(499900)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps productType to category', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Peripherals')
  })

  it('maps vendorId to supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['vendor-42'])
  })

  it('maps barcode to upc', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('0123456789012')
  })

  it('always sets unitOfMeasure to "each"', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('sets isActive from active flag', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps createdAt and updatedAt as ISO strings', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces output satisfying ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
