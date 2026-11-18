import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawDeposcoItem,
} from '../../../../../../../src/verticals/inventory/adapters/deposco/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('deposco transformProduct', () => {
  const raw: RawDeposcoItem = {
    itemNumber: 'DEP-SKU-001',
    description: 'Steel Bolt M8',
    description2: 'M8 x 25mm hex bolt, stainless steel',
    upc: '098765432109',
    vendorNumber: 'vendor-001',
    vendorName: 'FastenersCo',
    weight: 0.5,
    weightUom: 'LB',
    length: 4,
    width: 2,
    height: 1,
    dimensionUom: 'IN',
    price: 5,
    category: 'Hardware',
    productLine: 'Fasteners',
    active: 'Y',
    createdDate: '2024-03-01T00:00:00Z',
    lastModifiedDate: '2024-03-01T00:00:00Z',
  }

  it('maps id, externalId, and sku from itemNumber', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('DEP-SKU-001')
    expect(result.externalId).toBe('DEP-SKU-001')
    expect(result.sku).toBe('DEP-SKU-001')
  })

  it('maps name from description', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Steel Bolt M8')
  })

  it('maps description from description2', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('M8 x 25mm hex bolt, stainless steel')
  })

  it('converts weight from LB to grams', () => {
    const result = transformProduct(raw)
    // 0.5 lb * 453.592 = 226.796 -> Math.round not used; raw multiplication
    expect(result.weightGrams).toBeCloseTo(0.5 * 453.592)
  })

  it('converts weight from KG to grams', () => {
    const result = transformProduct({ ...raw, weight: 1, weightUom: 'KG' })
    expect(result.weightGrams).toBeCloseTo(1000)
  })

  it('converts weight from OZ to grams', () => {
    const result = transformProduct({ ...raw, weight: 16, weightUom: 'OZ' })
    expect(result.weightGrams).toBeCloseTo(16 * 28.3495)
  })

  it('converts dimensions from IN to cm', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBeCloseTo(4 * 2.54)
    expect(result.dimensionsCm?.width).toBeCloseTo(2 * 2.54)
    expect(result.dimensionsCm?.height).toBeCloseTo(1 * 2.54)
  })

  it('maps retailPrice as raw decimal USD (not cents)', () => {
    const result = transformProduct({ ...raw, price: 1.25 })
    expect(result.retailPrice).toEqual({ amount: 1.25, currency: 'USD' })
  })

  it('maps brand from productLine', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('Fasteners')
  })

  it('maps category', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Hardware')
  })

  it('maps supplierIds from vendorNumber', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['vendor-001'])
  })

  it('maps isActive from "Y" string', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('defaults isActive to true when active absent', () => {
    const result = transformProduct({ itemNumber: 'DEP-SKU-002' })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to deposco', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('deposco')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
