import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawVersaProduct,
} from '../../../../../../../src/verticals/inventory/adapters/versa-cloud-erp/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

const baseRaw: RawVersaProduct = {
  id: 'item-001',
  part_number: 'WK-2026',
  item_name: 'Wireless Keyboard',
  description: 'Bluetooth wireless keyboard',
  sku: 'WK-2026-ALT',
  barcode: '0123456789012',
  item_type: 'PRODUCT',
  category_name: 'Peripherals',
  brand_name: 'Keyboards Inc',
  uom: 'each',
  weight: 0.45,
  length: 44,
  width: 13,
  height: 3,
  sell_price_1: 29.99,
  cost_price: 14.99,
  currency: 'USD',
  is_active: true,
  parent_item_id: null,
  default_vendor_id: 'vendor-001',
  created_at: '2024-03-01T00:00:00Z',
  updated_at: '2024-03-01T00:00:00Z',
}

describe('versa-cloud-erp transformProduct', () => {
  it('maps id from id field', () => {
    expect(transformProduct(baseRaw).id).toBe('item-001')
  })

  it('maps sku from part_number, falling back to sku', () => {
    expect(transformProduct(baseRaw).sku).toBe('WK-2026')
    const result = transformProduct({ ...baseRaw, part_number: undefined })
    expect(result.sku).toBe('WK-2026-ALT')
  })

  it('maps name from item_name', () => {
    expect(transformProduct(baseRaw).name).toBe('Wireless Keyboard')
  })

  it('maps upc from barcode', () => {
    expect(transformProduct(baseRaw).upc).toBe('0123456789012')
  })

  it('maps brand from brand_name', () => {
    expect(transformProduct(baseRaw).brand).toBe('Keyboards Inc')
  })

  it('maps category from category_name', () => {
    expect(transformProduct(baseRaw).category).toBe('Peripherals')
  })

  it('maps unitOfMeasure from uom', () => {
    expect(transformProduct(baseRaw).unitOfMeasure).toBe('each')
  })

  it('converts weight from kg to grams', () => {
    expect(transformProduct(baseRaw).weightGrams).toBeCloseTo(450)
  })

  it('maps dimensionsCm from length/width/height', () => {
    expect(transformProduct(baseRaw).dimensionsCm).toEqual({ length: 44, width: 13, height: 3 })
  })

  it('converts retailPrice to minor units in account currency', () => {
    expect(transformProduct(baseRaw).retailPrice).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps isActive from is_active', () => {
    expect(transformProduct(baseRaw).isActive).toBe(true)
    expect(transformProduct({ ...baseRaw, is_active: false }).isActive).toBe(false)
  })

  it('maps supplierIds from default_vendor_id', () => {
    expect(transformProduct(baseRaw).supplierIds).toEqual(['vendor-001'])
  })

  it('maps createdAt and updatedAt from date fields', () => {
    const result = transformProduct(baseRaw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to versa-cloud-erp', () => {
    expect(transformProduct(baseRaw).platform).toBe('versa-cloud-erp')
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(baseRaw))).not.toThrow()
  })
})
