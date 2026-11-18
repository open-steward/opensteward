import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSumtrackerProduct,
} from '../../../../../../../src/verticals/inventory/adapters/sumtracker/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

function makeRaw(overrides: Partial<RawSumtrackerProduct> = {}): RawSumtrackerProduct {
  return {
    id: 101,
    sku: 'SKU-001',
    name: 'Blue Widget',
    description: 'A fine widget',
    barcode: '012345678901',
    brand: 'WidgetCo',
    category: 'Widgets',
    product_type: 'physical',
    unit: 'each',
    weight: 2,
    weight_unit: 'kg',
    length: 10,
    width: 5,
    height: 3,
    dimension_unit: 'cm',
    selling_price: 19.99,
    currency: 'USD',
    is_active: true,
    is_bundle: false,
    supplier_id: 55,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (sumtracker)', () => {
  it('maps id, externalId, sku, and name', () => {
    const result = transformProduct(makeRaw({ id: 7 }))
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
    expect(result.sku).toBe('SKU-001')
    expect(result.name).toBe('Blue Widget')
  })

  it('converts kg weight to grams', () => {
    const result = transformProduct(makeRaw({ weight: 2, weight_unit: 'kg' }))
    expect(result.weightGrams).toBe(2000)
  })

  it('converts lbs weight to grams', () => {
    const result = transformProduct(makeRaw({ weight: 1, weight_unit: 'lb' }))
    // 1 lb × 453.592
    expect(result.weightGrams).toBeCloseTo(453.592)
  })

  it('maps dimensionsCm when dimensions are present', () => {
    const result = transformProduct(makeRaw())
    expect(result.dimensionsCm).toBeDefined()
    expect(result.dimensionsCm!.length).toBe(10)
    expect(result.dimensionsCm!.width).toBe(5)
    expect(result.dimensionsCm!.height).toBe(3)
  })

  it('converts selling_price to minor units (cents)', () => {
    const result = transformProduct(makeRaw({ selling_price: 19.99, currency: 'USD' }))
    expect(result.retailPrice).toBeDefined()
    expect(result.retailPrice!.amount).toBe(1999)
    expect(result.retailPrice!.currency).toBe('USD')
  })

  it('maps supplierIds from supplier_id', () => {
    const result = transformProduct(makeRaw({ supplier_id: 55 }))
    expect(result.supplierIds).toEqual(['55'])
  })

  it('supplierIds is empty when supplier_id is absent', () => {
    const result = transformProduct(makeRaw({ supplier_id: undefined }))
    expect(result.supplierIds).toEqual([])
  })

  it('maps createdAt and updatedAt as ISO strings', () => {
    const result = transformProduct(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is "sumtracker"', () => {
    const result = transformProduct(makeRaw())
    expect(result.platform).toBe('sumtracker')
  })

  it('passes ProductSchema validation', () => {
    const result = transformProduct(makeRaw())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
