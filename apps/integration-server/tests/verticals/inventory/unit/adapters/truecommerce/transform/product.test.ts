import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawTruecommerceProduct,
} from '../../../../../../../src/verticals/inventory/adapters/truecommerce/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<RawTruecommerceProduct> = {}): RawTruecommerceProduct {
  return {
    item_id: 'item_001',
    sku: 'WK-2026',
    description: 'Wireless Keyboard',
    long_description: 'Bluetooth wireless keyboard, US layout.',
    upc: '0123456789012',
    brand: 'Keyboards Inc',
    category_name: 'Peripherals',
    unit_of_measure: 'each',
    weight_lbs: 2,
    length_in: 17.32,
    width_in: 5.12,
    height_in: 1.18,
    // Already in minor units (cents)
    unit_price: 4999,
    currency: 'USD',
    is_active: true,
    parent_item_id: 'item_000',
    supplier_ids: ['sup_001', 'sup_002'],
    created_date: '2024-03-01T00:00:00Z',
    modified_date: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

// ─── transformProduct ─────────────────────────────────────────────────────────

describe('transformProduct', () => {
  it('maps id and externalId from item_id', () => {
    const result = transformProduct(makeRaw())
    expect(result.id).toBe('item_001')
    expect(result.externalId).toBe('item_001')
  })

  it('maps sku from raw.sku', () => {
    const result = transformProduct(makeRaw())
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name from description', () => {
    const result = transformProduct(makeRaw())
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps description from long_description', () => {
    const result = transformProduct(makeRaw())
    expect(result.description).toBe('Bluetooth wireless keyboard, US layout.')
  })

  it('maps upc, brand, category correctly', () => {
    const result = transformProduct(makeRaw())
    expect(result.upc).toBe('0123456789012')
    expect(result.brand).toBe('Keyboards Inc')
    expect(result.category).toBe('Peripherals')
  })

  it('converts weight_lbs to grams using Math.round(lbs * 453.592)', () => {
    const result = transformProduct(makeRaw({ weight_lbs: 2 }))
    // 2 * 453.592 = 907.184 → Math.round = 907
    expect(result.weightGrams).toBe(907)
  })

  it('converts inches to cm using Math.round(in * 2.54 * 100) / 100', () => {
    const result = transformProduct(makeRaw({ length_in: 10, width_in: 5, height_in: 2 }))
    // 10 * 2.54 * 100 = 2540 → /100 = 25.4
    expect(result.dimensionsCm?.length).toBeCloseTo(25.4, 2)
    // 5 * 2.54 * 100 = 1270 → /100 = 12.7
    expect(result.dimensionsCm?.width).toBeCloseTo(12.7, 2)
    // 2 * 2.54 * 100 = 508 → /100 = 5.08
    expect(result.dimensionsCm?.height).toBeCloseTo(5.08, 2)
  })

  it('passes unit_price through directly as minor units (no conversion)', () => {
    // 4999 cents passed as-is — TrueCommerce already stores in minor units
    const result = transformProduct(makeRaw({ unit_price: 4999 }))
    expect(result.retailPrice?.amount).toBe(4999)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('defaults currency to USD when absent', () => {
    const result = transformProduct(makeRaw({ currency: undefined }))
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps isActive from boolean', () => {
    const result = transformProduct(makeRaw({ is_active: false }))
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when is_active is absent', () => {
    const result = transformProduct(makeRaw({ is_active: undefined }))
    expect(result.isActive).toBe(true)
  })

  it('maps parentProductId from parent_item_id', () => {
    const result = transformProduct(makeRaw())
    expect(result.parentProductId).toBe('item_000')
  })

  it('maps supplierIds from supplier_ids array', () => {
    const result = transformProduct(makeRaw())
    expect(result.supplierIds).toEqual(['sup_001', 'sup_002'])
  })

  it('returns empty supplierIds when supplier_ids is absent', () => {
    const result = transformProduct(makeRaw({ supplier_ids: undefined }))
    expect(result.supplierIds).toEqual([])
  })

  it('maps createdAt and updatedAt to ISO strings', () => {
    const result = transformProduct(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('hardcodes platform to "truecommerce"', () => {
    const result = transformProduct(makeRaw())
    expect(result.platform).toBe('truecommerce')
  })

  it('omits dimensionsCm when all dimension fields are absent', () => {
    const result = transformProduct(
      makeRaw({ length_in: undefined, width_in: undefined, height_in: undefined }),
    )
    expect(result.dimensionsCm).toBeUndefined()
  })

  it('uses empty string for sku when sku is absent', () => {
    const result = transformProduct(makeRaw({ sku: undefined }))
    expect(result.sku).toBe('')
  })

  it('defaults unitOfMeasure to "each" when unit_of_measure is absent', () => {
    const result = transformProduct(makeRaw({ unit_of_measure: undefined }))
    expect(result.unitOfMeasure).toBe('each')
  })

  it('passes ProductSchema.parse without throwing', () => {
    const result = transformProduct(makeRaw())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
