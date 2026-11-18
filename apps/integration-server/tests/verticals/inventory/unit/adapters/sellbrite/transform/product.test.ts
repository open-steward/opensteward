import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSellbriteProduct,
} from '../../../../../../../src/verticals/inventory/adapters/sellbrite/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('sellbrite transformProduct', () => {
  const raw: RawSellbriteProduct = {
    sku: 'WK-2026',
    name: 'Wireless Keyboard',
    description: 'Bluetooth wireless keyboard',
    brand: 'KeyBrands',
    category_name: 'Peripherals',
    price: 49.99,
    cost: 25.0,
    upc: '0123456789012',
    package_weight: 1.0,
    package_unit_of_weight: 'lb',
    package_length: 17.3,
    package_width: 5.1,
    package_height: 1.2,
    package_unit_of_length: 'in',
    created_at: '2024-03-01T00:00:00Z',
    modified_at: '2024-03-01T00:00:00Z',
  }

  it('maps id and sku from sku', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('WK-2026')
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Bluetooth wireless keyboard')
  })

  it('converts price (dollars) to retailPrice minor units (cents)', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(4999) // 49.99 × 100
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('converts cost (dollars) to cost minor units (cents)', () => {
    const result = transformProduct(raw)
    expect(result.cost?.amount).toBe(2500) // 25.00 × 100
    expect(result.cost?.currency).toBe('USD')
  })

  it('converts lb weight to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(454) // 1.0 lb × 453.592 ≈ 454
  })

  it('converts oz weight to grams', () => {
    const result = transformProduct({ ...raw, package_weight: 16, package_unit_of_weight: 'oz' })
    expect(result.weightGrams).toBe(454) // 16 oz × 28.3495 ≈ 454
  })

  it('converts kg weight to grams', () => {
    const result = transformProduct({ ...raw, package_weight: 0.5, package_unit_of_weight: 'kg' })
    expect(result.weightGrams).toBe(500)
  })

  it('converts inch dimensions to cm', () => {
    const result = transformProduct(raw)
    // 17.3 in × 2.54 = 43.942 cm, rounded to 2 dp
    expect(result.dimensionsCm?.length).toBeCloseTo(43.94, 1)
    expect(result.dimensionsCm?.width).toBeCloseTo(12.95, 1)
    expect(result.dimensionsCm?.height).toBeCloseTo(3.05, 1)
  })

  it('maps upc', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('0123456789012')
  })

  it('maps brand', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('KeyBrands')
  })

  it('maps category from category_name', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Peripherals')
  })

  it('unitOfMeasure is always each', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('isActive is always true (Sellbrite has no active flag)', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps parentProductId from parent_sku', () => {
    const result = transformProduct({ ...raw, parent_sku: 'WK-PARENT' })
    expect(result.parentProductId).toBe('WK-PARENT')
  })

  it('platform is sellbrite', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('sellbrite')
  })

  it('produces output satisfying ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
