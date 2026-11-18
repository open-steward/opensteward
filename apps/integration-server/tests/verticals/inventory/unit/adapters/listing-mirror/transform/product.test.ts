import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariation,
  type RawListingMirrorProduct,
  type RawListingMirrorVariation,
} from '../../../../../../../src/verticals/inventory/adapters/listing-mirror/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('listing-mirror transformProduct', () => {
  const raw: RawListingMirrorProduct = {
    id: 42,
    sku: 'LM-SKU-001',
    title: 'Widget Blue',
    description: 'A blue widget',
    brand: 'WidgetCo',
    price: 49.99,
    isActive: true,
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from id coerced to string', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps sku from sku field', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('LM-SKU-001')
  })

  it('maps name from title', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Widget Blue')
  })

  it('maps brand from brand field', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('WidgetCo')
  })

  it('converts decimal price to integer cents with hardcoded USD currency', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('rounds price to nearest cent', () => {
    const result = transformProduct({ ...raw, price: 1.995 })
    expect(result.retailPrice?.amount).toBe(200)
  })

  it('sets retailPrice to undefined when price is absent', () => {
    const result = transformProduct({ ...raw, price: undefined })
    expect(result.retailPrice).toBeUndefined()
  })

  it('maps isActive from isActive flag', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('defaults isActive to true when isActive is absent', () => {
    const result = transformProduct({ ...raw, isActive: undefined })
    expect(result.isActive).toBe(true)
  })

  it('maps createdAt to ISO string', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to listing-mirror', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('listing-mirror')
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})

describe('listing-mirror transformVariation', () => {
  const rawVariation: RawListingMirrorVariation = {
    id: 99,
    sku: 'LM-VAR-001',
    quantity: 10,
    price: 29.99,
  }

  it('maps id from variation id', () => {
    const result = transformVariation(rawVariation, 'parent-42')
    expect(result.id).toBe('99')
  })

  it('maps parentProductId from parentId argument', () => {
    const result = transformVariation(rawVariation, 'parent-42')
    expect(result.parentProductId).toBe('parent-42')
  })

  it('converts decimal variation price to integer cents', () => {
    const result = transformVariation(rawVariation, 'parent-42')
    expect(result.retailPrice).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('sets isActive to true always', () => {
    const result = transformVariation(rawVariation, 'parent-42')
    expect(result.isActive).toBe(true)
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformVariation(rawVariation, 'parent-42'))).not.toThrow()
  })
})
