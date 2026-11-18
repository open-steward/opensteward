import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawVendProduct,
} from '../../../../../../../src/verticals/inventory/adapters/vend-pos/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

const baseRaw: RawVendProduct = {
  id: 'prod-uuid-001',
  handle: 'wireless-keyboard',
  sku: 'WK-2026',
  name: 'Wireless Keyboard',
  base_name: 'Wireless Keyboard Base',
  description: 'Bluetooth wireless keyboard',
  source_id: '0123456789012',
  supplier_code: 'SUP-WK',
  supplier_id: 'sup-uuid-001',
  price: 29.99,
  price_including_tax: 32.99,
  supply_price: 14.99,
  brand_id: 'brand-uuid-001',
  product_type_id: 'type-uuid-001',
  type: 'Peripherals',
  has_variants: false,
  is_active: true,
  created_at: '2024-03-01T00:00:00Z',
  updated_at: '2024-03-01T00:00:00Z',
  deleted_at: null,
}

describe('vend-pos transformProduct', () => {
  it('maps id from id field', () => {
    expect(transformProduct(baseRaw).id).toBe('prod-uuid-001')
  })

  it('maps sku from sku field', () => {
    expect(transformProduct(baseRaw).sku).toBe('WK-2026')
  })

  it('maps name from name field, falling back to base_name', () => {
    expect(transformProduct(baseRaw).name).toBe('Wireless Keyboard')
    const result = transformProduct({ ...baseRaw, name: undefined })
    expect(result.name).toBe('Wireless Keyboard Base')
  })

  it('maps upc from source_id', () => {
    expect(transformProduct(baseRaw).upc).toBe('0123456789012')
  })

  it('maps brand from brand_id (UUID passthrough)', () => {
    expect(transformProduct(baseRaw).brand).toBe('brand-uuid-001')
  })

  it('maps category from type', () => {
    expect(transformProduct(baseRaw).category).toBe('Peripherals')
  })

  it('hardcodes unitOfMeasure to each', () => {
    expect(transformProduct(baseRaw).unitOfMeasure).toBe('each')
  })

  it('retailPrice is intentionally omitted (currency is per-outlet in Vend)', () => {
    // Vend omits retailPrice because currency lives at outlet level
    expect(transformProduct(baseRaw).retailPrice).toBeUndefined()
  })

  it('maps isActive from is_active when deleted_at is null', () => {
    expect(transformProduct(baseRaw).isActive).toBe(true)
  })

  it('sets isActive false when deleted_at is present', () => {
    const result = transformProduct({ ...baseRaw, deleted_at: '2024-03-01T00:00:00Z' })
    expect(result.isActive).toBe(false)
  })

  it('maps supplierIds from supplier_id', () => {
    expect(transformProduct(baseRaw).supplierIds).toEqual(['sup-uuid-001'])
  })

  it('maps parentProductId from variant_parent_id', () => {
    const result = transformProduct({ ...baseRaw, variant_parent_id: 'parent-uuid-001' })
    expect(result.parentProductId).toBe('parent-uuid-001')
  })

  it('sets platform to vend-pos', () => {
    expect(transformProduct(baseRaw).platform).toBe('vend-pos')
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(baseRaw))).not.toThrow()
  })
})
