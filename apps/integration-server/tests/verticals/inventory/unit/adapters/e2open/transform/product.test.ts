import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawE2openProduct,
} from '../../../../../../../src/verticals/inventory/adapters/e2open/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('e2open transformProduct', () => {
  const raw: RawE2openProduct = {
    id: 'E2O-001',
    partnerSkuCode: 'SKU-ABC',
    validatedSkuCode: 'VSKU-ABC',
    skuDescription: 'Blue Widget',
    brandName: 'WidgetCo',
    categoryCode: 'WIDGETS',
    uomCode: 'each',
    listPrice: 19.99,
    currencyCode: 'USD',
    isActive: true,
    parentSkuCode: 'SKU-PARENT',
    partnerCode: 'PARTNER-001',
    partnerName: 'Widget Partner Inc',
    createdDate: '2024-03-01T00:00:00.000Z',
    lastModifiedDate: '2024-03-01T00:00:00.000Z',
  }

  it('maps id and externalId from id field', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('E2O-001')
    expect(result.externalId).toBe('E2O-001')
  })

  it('falls back to partnerSkuCode then validatedSkuCode for id', () => {
    const result = transformProduct({ ...raw, id: undefined })
    expect(result.id).toBe('SKU-ABC')
  })

  it('maps sku from partnerSkuCode', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('SKU-ABC')
  })

  it('maps name from skuDescription', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Blue Widget')
  })

  it('falls back to sku for name when skuDescription absent', () => {
    const result = transformProduct({ ...raw, skuDescription: undefined })
    expect(result.name).toBe('SKU-ABC')
  })

  it('maps brand from brandName', () => {
    const result = transformProduct(raw)
    expect(result.brand).toBe('WidgetCo')
  })

  it('maps category from categoryCode', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('WIDGETS')
  })

  it('maps unitOfMeasure from uomCode', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('defaults unitOfMeasure to each when uomCode absent', () => {
    const result = transformProduct({ ...raw, uomCode: undefined })
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts listPrice to minor units for retailPrice.amount', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(1999)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps isActive from isActive field', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps parentProductId from parentSkuCode', () => {
    const result = transformProduct(raw)
    expect(result.parentProductId).toBe('SKU-PARENT')
  })

  it('maps supplierIds from partnerCode', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['PARTNER-001'])
  })

  it('maps createdAt from createdDate', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps updatedAt from lastModifiedDate', () => {
    const result = transformProduct(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to e2open', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('e2open')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
