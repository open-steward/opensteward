import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawApicbaseIngredient,
} from '../../../../../../../src/verticals/inventory/adapters/apicbase/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('apicbase transformProduct', () => {
  const raw: RawApicbaseIngredient = {
    uid: 'ing-001',
    internal_uid: 'SKU-ABC',
    name: 'Olive Oil',
    short_name: 'OO',
    category: 'Oils',
    subcategory: 'Vegetable Oils',
    in_use: true,
    approved: true,
    created_date: '2024-03-01T00:00:00Z',
    modified_date: '2024-03-01T00:00:00Z',
    archived_on: null,
    supplier: { uid: 'sup-999', name: 'Best Supplier' },
    unit: { name: 'litre' },
  }

  it('maps id and externalId from uid', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('ing-001')
    expect(result.externalId).toBe('ing-001')
  })

  it('maps sku from internal_uid', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('SKU-ABC')
  })

  it('maps name from name field', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Olive Oil')
  })

  it('maps category', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Oils')
  })

  it('sets isActive true when in_use and archived_on is null', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when archived_on is set', () => {
    const result = transformProduct({ ...raw, archived_on: '2024-03-01T00:00:00Z' })
    expect(result.isActive).toBe(false)
  })

  it('resolves nested supplier uid into supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['sup-999'])
  })

  it('resolves string supplier into supplierIds', () => {
    const result = transformProduct({ ...raw, supplier: 'sup-string' })
    expect(result.supplierIds).toEqual(['sup-string'])
  })

  it('resolves unit from nested object', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('litre')
  })

  it('sets platform to apicbase', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('apicbase')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
