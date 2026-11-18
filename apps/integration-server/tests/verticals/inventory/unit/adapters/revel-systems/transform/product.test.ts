import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawRevelProduct,
} from '../../../../../../../src/verticals/inventory/adapters/revel-systems/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('revel-systems transformProduct', () => {
  const raw: RawRevelProduct = {
    id: 42,
    name: 'Craft Burger',
    sku: 'BURGER-001',
    barcode: '0123456789012',
    price: 14.99,
    cost: 5.5,
    active: true,
    description: 'House specialty burger',
    product_class: '/resources/ProductClass/7/',
    establishment: 5,
    created_date: '2024-03-01T00:00:00Z',
    updated_date: '2024-03-01T00:00:00Z',
    unit_type: 'each',
    custom_sku: 'CUSTOM-BURGER',
  }

  it('stringifies numeric id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps sku (prefers sku over custom_sku)', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('BURGER-001')
  })

  it('falls back to custom_sku when sku is absent', () => {
    const result = transformProduct({ ...raw, sku: undefined })
    expect(result.sku).toBe('CUSTOM-BURGER')
  })

  it('converts price dollars to cents for retailPrice', () => {
    const result = transformProduct(raw)
    // 14.99 * 100 = 1499 cents
    expect(result.retailPrice?.amount).toBe(1499)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('converts cost dollars to cents', () => {
    const result = transformProduct(raw)
    // 5.50 * 100 = 550 cents
    expect(result.cost?.amount).toBe(550)
    expect(result.cost?.currency).toBe('USD')
  })

  it('extracts numeric category from product_class URI', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('7')
  })

  it('returns undefined category for null/absent product_class', () => {
    const result = transformProduct({ ...raw, product_class: null })
    expect(result.category).toBeUndefined()
  })

  it('maps unitOfMeasure from unit_type', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('defaults unitOfMeasure to "each" when unit_type is absent', () => {
    const result = transformProduct({ ...raw, unit_type: null })
    expect(result.unitOfMeasure).toBe('each')
  })

  it('maps isActive', () => {
    expect(transformProduct({ ...raw, active: true }).isActive).toBe(true)
    expect(transformProduct({ ...raw, active: false }).isActive).toBe(false)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps upc from barcode', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('0123456789012')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
