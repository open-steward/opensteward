import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawJubelioProduct,
} from '../../../../../../../src/verticals/inventory/adapters/jubelio/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — jubelio item', () => {
  const raw: RawJubelioProduct = {
    item_id: 100,
    item_code: 'WDG-001',
    item_name: 'Widget Premium',
    description: 'A premium widget',
    unit: 'each',
    weight: 0.5,
    sell_price: 75000,
    buy_price: 50000,
    is_active: true,
    item_group_id: 10,
    item_group_name: 'Widgets',
    brand: 'BrandX',
    barcode: '8991234567890',
    length: 10,
    width: 5,
    height: 3,
    created_date: '2024-03-01T00:00:00Z',
    modified_date: '2024-03-01T00:00:00Z',
  }
  const result = transformProduct(raw)

  it('sets id from item_id', () => {
    expect(result.id).toBe('100')
  })

  it('sets sku from item_code', () => {
    expect(result.sku).toBe('WDG-001')
  })

  it('sets name from item_name', () => {
    expect(result.name).toBe('Widget Premium')
  })

  it('sets upc from barcode', () => {
    expect(result.upc).toBe('8991234567890')
  })

  it('sets brand from brand', () => {
    expect(result.brand).toBe('BrandX')
  })

  it('sets category from item_group_name', () => {
    expect(result.category).toBe('Widgets')
  })

  it('sets parentProductId from item_group_id', () => {
    expect(result.parentProductId).toBe('10')
  })

  it('converts weight from kg to grams', () => {
    expect(result.weightGrams).toBe(500)
  })

  it('sets retailPrice.amount from sell_price', () => {
    expect(result.retailPrice?.amount).toBe(75000)
  })

  it('sets retailPrice.currency to IDR (hardcoded)', () => {
    expect(result.retailPrice?.currency).toBe('IDR')
  })

  it('sets dimensionsCm from length/width/height', () => {
    expect(result.dimensionsCm).toEqual({ length: 10, width: 5, height: 3 })
  })

  it('sets isActive from is_active', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets createdAt from created_date', () => {
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to jubelio', () => {
    expect(result.platform).toBe('jubelio')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — minimal jubelio item', () => {
  const raw: RawJubelioProduct = {
    item_id: '999',
    item_code: undefined,
    is_active: false,
  }
  const result = transformProduct(raw)

  it('sets sku to empty string when item_code absent', () => {
    expect(result.sku).toBe('')
  })

  it('sets isActive to false', () => {
    expect(result.isActive).toBe(false)
  })

  it('weightGrams is undefined when weight absent', () => {
    expect(result.weightGrams).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
