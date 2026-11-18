/**
 * Fixture fields and types from the "Available fields" table of
 * https://erplain.readme.io/v2.0/reference/products-queries (ids are Int,
 * DateTime is "YYYY-MM-DD HH:MM:SS" per /v2.0/reference/data-types).
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawErplainProduct,
} from '../../../../../../../src/verticals/inventory/adapters/erplain/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

const raw: RawErplainProduct = {
  id: 100050,
  label: 'Tee-Shirt',
  active: true,
  sku: 'TSH-BLUE',
  type: 'Variant',
  description: 'Cotton tee-shirt',
  supplier_description: 'Tee-shirt, 180 gsm',
  country_of_origin: 'FR',
  default_supplier_id: 5001,
  brand: { label: 'Acme Apparel' },
  created_at: '2026-01-15 09:30:00',
  updated_at: '2026-02-01 14:20:00',
}

describe('erplain transformProduct', () => {
  it('parses against the canonical ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })

  it('maps the documented fields', () => {
    const p = ProductSchema.parse(transformProduct(raw))
    expect(p.id).toBe('100050')
    expect(p.externalId).toBe('100050')
    expect(p.name).toBe('Tee-Shirt')
    expect(p.sku).toBe('TSH-BLUE')
    expect(p.description).toBe('Cotton tee-shirt')
    expect(p.brand).toBe('Acme Apparel')
    expect(p.isActive).toBe(true)
    expect(p.supplierIds).toEqual(['5001'])
    expect(p.platform).toBe('erplain')
  })

  it('keeps zone-less DateTimes in metadata instead of guessing an instant', () => {
    const p = ProductSchema.parse(transformProduct(raw))
    expect(p.createdAt).toBeUndefined()
    expect(p.updatedAt).toBeUndefined()
    expect(p.metadata).toMatchObject({
      created_at: '2026-01-15 09:30:00',
      updated_at: '2026-02-01 14:20:00',
      type: 'Variant',
      country_of_origin: 'FR',
      supplier_description: 'Tee-shirt, 180 gsm',
    })
  })

  it('reads the documented 0/1 booleans', () => {
    expect(transformProduct({ ...raw, active: 0 }).isActive).toBe(false)
  })

  it('does not invent a category, unit or weight', () => {
    const p = transformProduct(raw)
    expect(p.category).toBeUndefined()
    expect(p.unitOfMeasure).toBeUndefined()
    expect(p.weightGrams).toBeUndefined()
  })

  it('leaves supplierIds empty without a default supplier', () => {
    expect(transformProduct({ ...raw, default_supplier_id: null }).supplierIds).toEqual([])
  })

  it('throws without an active flag rather than assuming one', () => {
    expect(() => transformProduct({ ...raw, active: null })).toThrow(/active/)
  })
})
