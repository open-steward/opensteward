import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawQoblexProduct,
  type RawQoblexVariant,
} from '../../../../../../../src/verticals/inventory/adapters/qoblex/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('qoblex transformProduct', () => {
  const variant: RawQoblexVariant = {
    id: 101,
    name: 'Wireless Keyboard - Black',
    sku: 'WK-2026-BLK',
    barcode: '0123456789012',
    weight: 0.45,
    weight_unit: 'kg',
    retail_price: 49.99,
    quantity: 250,
    allocated_quantity: 10,
    incoming_quantity: 100,
    last_updated_time: '2024-03-01T00:00:00Z',
    supplier_ids: [55],
    brand: 'KB Co',
    product_type: 'Electronics',
  }

  const raw: RawQoblexProduct = {
    id: 10,
    name: 'Wireless Keyboard',
    description: 'Full-size BT keyboard',
    updated_at: '2024-03-01T00:00:00Z',
    is_archived: false,
    product_type: 'Electronics',
    brand: 'KB Co',
    tags: 'keyboard,wireless',
    supplier: { supplier_id: 55, name: 'KB Supplies' },
    variants: [variant],
  }

  it('uses variant id as canonical id', () => {
    const result = transformProduct(raw, variant)
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
  })

  it('maps sku and name from variant', () => {
    const result = transformProduct(raw, variant)
    expect(result.sku).toBe('WK-2026-BLK')
    expect(result.name).toBe('Wireless Keyboard - Black')
  })

  it('converts kg weight to grams', () => {
    const result = transformProduct(raw, variant)
    // 0.45 kg * 1000 = 450 g
    expect(result.weightGrams).toBeCloseTo(450, 1)
  })

  it('converts lb weight to grams', () => {
    const v: RawQoblexVariant = { ...variant, weight: 1, weight_unit: 'lb' }
    const result = transformProduct(raw, v)
    expect(result.weightGrams).toBeCloseTo(453.592, 1)
  })

  it('treats grams as grams (no conversion)', () => {
    const v: RawQoblexVariant = { ...variant, weight: 450, weight_unit: 'g' }
    const result = transformProduct(raw, v)
    expect(result.weightGrams).toBe(450)
  })

  it('sets isActive to true when is_archived is false', () => {
    const result = transformProduct(raw, variant)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive to false when is_archived is true', () => {
    const result = transformProduct({ ...raw, is_archived: true }, variant)
    expect(result.isActive).toBe(false)
  })

  it('sets parentProductId when a variant is passed', () => {
    const result = transformProduct(raw, variant)
    expect(result.parentProductId).toBe('10')
  })

  it('omits parentProductId when no explicit variant is passed', () => {
    const result = transformProduct(raw)
    expect(result.parentProductId).toBeUndefined()
  })

  it('collects supplierIds from parent supplier and variant supplier_ids', () => {
    const result = transformProduct(raw, variant)
    expect(result.supplierIds).toContain('55')
    // supplier_id 55 from parent + 55 from variant — deduped to 1
    expect(result.supplierIds.length).toBe(1)
  })

  it('maps upc from variant barcode', () => {
    const result = transformProduct(raw, variant)
    expect(result.upc).toBe('0123456789012')
  })

  it('maps category from product_type', () => {
    const result = transformProduct(raw, variant)
    expect(result.category).toBe('Electronics')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw, variant)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
