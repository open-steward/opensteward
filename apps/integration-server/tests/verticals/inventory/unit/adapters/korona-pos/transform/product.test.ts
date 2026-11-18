import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawKoronaPosProduct,
} from '../../../../../../../src/verticals/inventory/adapters/korona-pos/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('korona-pos transformProduct', () => {
  const raw: RawKoronaPosProduct = {
    id: 'prod-uuid-001',
    number: 'SKU-001',
    name: 'Espresso Beans 500g',
    active: true,
    codes: [{ productCode: '4007817323700', containerSize: 1 }],
    descriptions: [
      { type: 'DESCRIPTION', text: 'Premium espresso blend' },
      { type: 'SHORT', text: 'Espresso' },
    ],
    prices: [{ value: 12.99, priceGroup: { id: 'pg-001', number: 'DEFAULT' } }],
    supplierPrices: [{ id: 'sp-001', supplier: { id: 'sup-uuid-001', number: 'SUP-001' } }],
    sector: { id: 'sec-001', number: 'SEC-001', name: 'Beverages' },
    commodityGroup: { id: 'cg-001', number: 'CG-001', name: 'Coffee' },
    packagingUnit: 'unit',
    trackInventory: true,
  }

  it('maps id from raw.id', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('prod-uuid-001')
    expect(result.externalId).toBe('prod-uuid-001')
  })

  it('maps sku from number', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('SKU-001')
  })

  it('maps name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Espresso Beans 500g')
  })

  it('maps upc from first code productCode', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('4007817323700')
  })

  it('picks DESCRIPTION type entry for description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('Premium espresso blend')
  })

  it('maps category from commodityGroup.name', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Coffee')
  })

  it('maps unitOfMeasure from packagingUnit', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('unit')
  })

  it('defaults unitOfMeasure to each when packagingUnit missing', () => {
    const result = transformProduct({ ...raw, packagingUnit: undefined })
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts price from decimal to minor units (×100)', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(1299)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps supplierIds from supplierPrices', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['sup-uuid-001'])
  })

  it('sets isActive true when active=true', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when active=false', () => {
    const result = transformProduct({ ...raw, active: false })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to korona-pos', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('korona-pos')
  })

  it('produces output that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})
