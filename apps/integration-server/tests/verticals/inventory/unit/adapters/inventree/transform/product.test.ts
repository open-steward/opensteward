import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawInvenTreePart,
} from '../../../../../../../src/verticals/inventory/adapters/inventree/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — inventree part', () => {
  const raw: RawInvenTreePart = {
    pk: 42,
    name: 'Widget',
    full_name: 'Widget v2',
    description: 'A small widget',
    IPN: 'WDG-001',
    category: 5,
    category_name: 'Widgets',
    default_location: 7,
    default_supplier: 10,
    units: 'each',
    active: true,
    is_template: false,
    variant_of: null,
    creation_date: '2024-03-01',
    pricing_min: '5.00',
    pricing_max: '10.00',
    in_stock: 100,
    suppliers: 1,
  }
  const result = transformProduct(raw)

  it('sets id from pk', () => {
    expect(result.id).toBe('42')
  })

  it('sets sku from IPN', () => {
    expect(result.sku).toBe('WDG-001')
  })

  it('sets name from full_name', () => {
    expect(result.name).toBe('Widget v2')
  })

  it('sets category from category_name', () => {
    expect(result.category).toBe('Widgets')
  })

  it('sets unitOfMeasure from units', () => {
    expect(result.unitOfMeasure).toBe('each')
  })

  it('sets isActive from active', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets supplierIds from default_supplier', () => {
    expect(result.supplierIds).toEqual(['10'])
  })

  it('sets platform to inventree', () => {
    expect(result.platform).toBe('inventree')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — inventree part variant', () => {
  const raw: RawInvenTreePart = {
    pk: 55,
    name: 'Widget Blue',
    IPN: undefined,
    active: false,
    variant_of: 42,
    creation_date: '2024-03-01T00:00:00Z',
  }
  const result = transformProduct(raw)

  it('sets parentProductId from variant_of', () => {
    expect(result.parentProductId).toBe('42')
  })

  it('sets isActive to false', () => {
    expect(result.isActive).toBe(false)
  })

  it('falls back to empty string for sku when IPN absent', () => {
    expect(result.sku).toBe('')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
