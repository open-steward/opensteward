import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawCamelot3plProduct,
} from '../../../../../../../src/verticals/inventory/adapters/camelot-3pl/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('camelot-3pl transformProduct', () => {
  const raw: RawCamelot3plProduct = {
    itemId: 'item-001',
    sku: 'WDG-001',
    itemDescription: 'Widget Alpha',
    description: 'A robust widget for industrial use',
    upc: '012345678901',
    brand: 'WidgetCo',
    category: 'Hardware',
    itemClass: 'A',
    unitOfMeasure: 'each',
    weightLbs: 2.2,
    lengthIn: 10,
    widthIn: 5,
    heightIn: 3,
    unitPrice: 4999,
    isActive: true,
    supplierId: 'sup-001',
    supplierName: 'Acme Supplies',
    createdDate: '2024-03-01T00:00:00Z',
    lastModifiedDate: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from itemId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('item-001')
    expect(result.externalId).toBe('item-001')
  })

  it('maps sku', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('WDG-001')
  })

  it('maps name from itemDescription', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Widget Alpha')
  })

  it('maps description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('A robust widget for industrial use')
  })

  it('maps upc', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('012345678901')
  })

  it('maps brand', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('WidgetCo')
  })

  it('maps category', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Hardware')
  })

  it('maps unitOfMeasure', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts weightLbs to weightGrams', () => {
    const result = transformProduct(raw)
    // 2.2 lbs * 453.592 = 997.9024 → rounded to 998
    expect(result.weightGrams).toBe(998)
  })

  it('converts dimensions from inches to cm', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBeCloseTo(25.4, 5)
    expect(result.dimensionsCm?.width).toBeCloseTo(12.7, 5)
    expect(result.dimensionsCm?.height).toBeCloseTo(7.62, 5)
  })

  it('maps retailPrice from unitPrice', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(4999)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps isActive', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps supplierIds from supplierId', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['sup-001'])
  })

  it('maps createdAt from createdDate', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt from lastModifiedDate', () => {
    const result = transformProduct(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to camelot-3pl', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('camelot-3pl')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
