import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawD365Product,
} from '../../../../../../../src/verticals/inventory/adapters/dynamics-365-scm/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('dynamics-365-scm transformProduct', () => {
  const raw: RawD365Product = {
    ItemNumber: 'ITEM-001',
    ProductNumber: 'PROD-001',
    ProductName: 'Widget A',
    SearchName: 'WidgetA',
    Description: 'A standard widget',
    BarCode: '012345678901',
    ITEMGROUP: 'WIDGETS',
    INVENTORYUNITSYMBOL: 'each',
    SALESPRICE: 29.99,
    NetWeight: 0.5,
    GrossDepth: 10,
    GrossWidth: 5,
    GrossHeight: 3,
    IsSold: true,
    PRIMARYVENDORACCOUNTNUMBER: 'VENDOR-001',
    DataAreaId: 'USMF',
    CreatedDateTime: '2024-03-01T00:00:00Z',
    ModifiedDateTime: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId from ItemNumber', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('ITEM-001')
    expect(result.externalId).toBe('ITEM-001')
  })

  it('maps sku from ItemNumber', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('ITEM-001')
  })

  it('maps name from ProductName', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Widget A')
  })

  it('falls back to SearchName then ItemNumber for name', () => {
    const result = transformProduct({ ...raw, ProductName: undefined })
    expect(result.name).toBe('WidgetA')
  })

  it('maps description from Description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('A standard widget')
  })

  it('maps upc from BarCode', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('012345678901')
  })

  it('maps category from ITEMGROUP', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('WIDGETS')
  })

  it('maps unitOfMeasure from INVENTORYUNITSYMBOL', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('defaults unitOfMeasure to each when absent', () => {
    const result = transformProduct({ ...raw, INVENTORYUNITSYMBOL: undefined })
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts NetWeight kg to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(500)
  })

  it('maps dimensionsCm from GrossDepth/Width/Height', () => {
    const result = transformProduct(raw)
    expect(result.dimensionsCm?.length).toBe(10)
    expect(result.dimensionsCm?.width).toBe(5)
    expect(result.dimensionsCm?.height).toBe(3)
  })

  it('converts SALESPRICE decimal to minor units', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(2999)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps isActive from IsSold', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when IsSold is false', () => {
    const result = transformProduct({ ...raw, IsSold: false })
    expect(result.isActive).toBe(false)
  })

  it('maps supplierIds from PRIMARYVENDORACCOUNTNUMBER', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['VENDOR-001'])
  })

  it('maps createdAt from CreatedDateTime', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt from ModifiedDateTime', () => {
    const result = transformProduct(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to dynamics-365-scm', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('dynamics-365-scm')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
