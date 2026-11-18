import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawManhattanActiveItem,
} from '../../../../../../../src/verticals/inventory/adapters/manhattan-active/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('manhattan-active transformProduct', () => {
  const raw: RawManhattanActiveItem = {
    itemId: 'ITEM-001',
    itemNumber: 'MAN-SKU-001',
    description: 'Industrial Bolt',
    shortDescription: 'Bolt',
    upc: '012345678901',
    brand: 'BoltMaster',
    category: 'Hardware',
    itemType: 'STANDARD',
    unitOfMeasure: 'each',
    weight: 0.5,
    length: 2,
    width: 0.5,
    height: 0.5,
    retailPrice: 999,
    currency: 'USD',
    isActive: true,
    status: 'ACTIVE',
    parentItemId: 'PARENT-001',
    primarySupplierId: 'SUP-001',
    supplierIds: ['SUP-001', 'SUP-002'],
    createdDateTime: '2024-03-01T00:00:00Z',
    lastModifiedDateTime: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from itemId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('ITEM-001')
    expect(result.externalId).toBe('ITEM-001')
  })

  it('maps sku from itemNumber', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('MAN-SKU-001')
  })

  it('maps name from description', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Industrial Bolt')
  })

  it('maps description from shortDescription', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Bolt')
  })

  it('maps upc from upc field', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('012345678901')
  })

  it('maps brand from brand field', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('BoltMaster')
  })

  it('maps category from category field', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Hardware')
  })

  it('converts weight from lbs to grams (453.592 factor)', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBeCloseTo(226.796)
  })

  it('converts dimensions from inches to cm (2.54 factor)', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBeCloseTo(5.08)
    expect(result.dimensionsCm?.width).toBeCloseTo(1.27)
    expect(result.dimensionsCm?.height).toBeCloseTo(1.27)
  })

  it('passes retailPrice amount as-is (not converted to minor units)', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice).toEqual({ amount: 999, currency: 'USD' })
  })

  it('maps isActive from isActive flag', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('derives isActive from status INACTIVE when isActive absent', () => {
    const result = transformProduct({ ...raw, isActive: undefined, status: 'INACTIVE' })
    expect(result.isActive).toBe(false)
  })

  it('maps parentProductId from parentItemId', () => {
    const result = transformProduct(raw)
    expect(result.parentProductId).toBe('PARENT-001')
  })

  it('deduplicates supplierIds including primarySupplierId', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['SUP-001', 'SUP-002'])
  })

  it('maps createdAt from createdDateTime', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to manhattan-active', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('manhattan-active')
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})
