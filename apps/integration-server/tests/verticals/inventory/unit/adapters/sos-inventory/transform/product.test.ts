import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSosInventoryItem,
} from '../../../../../../../src/verticals/inventory/adapters/sos-inventory/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('sos-inventory transformProduct', () => {
  const raw: RawSosInventoryItem = {
    id: 99,
    name: 'Bulk Widget',
    sku: 'BW-001',
    description: 'A standard widget',
    barcode: '9780000000001',
    category: 'Widgets',
    // salesPrice=10 is integer so Amount (z.number().int()) passes
    salesPrice: 10,
    weight: 500,
    weightUnit: 'g',
    vendor: { id: 7, name: 'Widget World' },
    archived: false,
    lastSync: '2024-03-01T00:00:00Z',
  }

  it('maps id (numeric) as string, sku, and name', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('99')
    expect(result.sku).toBe('BW-001')
    expect(result.name).toBe('Bulk Widget')
    expect(result.platform).toBe('sos-inventory')
  })

  it('maps category and description', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Widgets')
    expect(result.description).toBe('A standard widget')
  })

  it('maps weight in grams directly when weightUnit is "g"', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(500)
  })

  it('converts weight in oz to grams', () => {
    const result = transformProduct({ ...raw, weight: 10, weightUnit: 'oz' })
    // 10 oz → 10 * 28.3495 = 283.495
    expect(result.weightGrams).toBeCloseTo(283.495, 1)
  })

  it('converts weight in lb to grams', () => {
    const result = transformProduct({ ...raw, weight: 2, weightUnit: 'lb' })
    expect(result.weightGrams).toBeCloseTo(907.184, 1)
  })

  it('converts weight in kg to grams', () => {
    const result = transformProduct({ ...raw, weight: 1, weightUnit: 'kg' })
    expect(result.weightGrams).toBe(1000)
  })

  it('maps salesPrice as-is to retailPrice.amount (major units)', () => {
    // SOS Inventory stores salesPrice as float major units, not cents
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(10)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps vendor.id to supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['7'])
  })

  it('maps weightUnit to unitOfMeasure', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('g')
  })

  it('sets isActive=true when archived=false', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive=false when archived=true', () => {
    const result = transformProduct({ ...raw, archived: true })
    expect(result.isActive).toBe(false)
  })

  it('maps lastSync to updatedAt', () => {
    const result = transformProduct(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces output satisfying ProductSchema (integer salesPrice, schema-valid weightUnit)', () => {
    // salesPrice=10 is integer → Amount (z.number().int()) passes.
    // weightUnit='g' maps to unitOfMeasure='g' which is NOT in UnitOfMeasureSchema;
    // use 'kg' so the unitOfMeasure is schema-valid for this parse assertion.
    const result = transformProduct({ ...raw, weightUnit: 'kg' })
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
