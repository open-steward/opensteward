import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawTecsysProduct,
} from '../../../../../../../src/verticals/inventory/adapters/tecsys/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

function makeRaw(overrides: Partial<RawTecsysProduct> = {}): RawTecsysProduct {
  return {
    Sku: 'SKU-TECSYS-001',
    PrimaryItemName: 'Blue Widget',
    ProductBackendName: 'Blue Widget Backend',
    Description: 'Industrial blue widget',
    Upc: '0123456789012',
    Brand: 'WidgetCo',
    CategoryName: 'Widgets',
    UnitOfMeasure: 'each',
    WeightKg: 1.5,
    LengthCm: 20,
    WidthCm: 10,
    HeightCm: 5,
    RetailPrice: 49.99,
    Currency: 'USD',
    IsActive: true,
    ParentSku: undefined,
    DefaultSupplierSku: 'VENDOR-A',
    CreatedDate: '2024-03-01T00:00:00Z',
    LastModifiedDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (tecsys)', () => {
  it('maps id, externalId, and sku from Sku', () => {
    const result = transformProduct(makeRaw())
    expect(result.id).toBe('SKU-TECSYS-001')
    expect(result.externalId).toBe('SKU-TECSYS-001')
    expect(result.sku).toBe('SKU-TECSYS-001')
  })

  it('maps name from PrimaryItemName', () => {
    const result = transformProduct(makeRaw())
    expect(result.name).toBe('Blue Widget')
  })

  it('falls back to ProductBackendName when PrimaryItemName is absent', () => {
    const result = transformProduct(makeRaw({ PrimaryItemName: undefined }))
    expect(result.name).toBe('Blue Widget Backend')
  })

  it('maps upc from Upc', () => {
    const result = transformProduct(makeRaw())
    expect(result.upc).toBe('0123456789012')
  })

  it('maps brand and category', () => {
    const result = transformProduct(makeRaw())
    expect(result.brand).toBe('WidgetCo')
    expect(result.category).toBe('Widgets')
  })

  it('maps unitOfMeasure', () => {
    const result = transformProduct(makeRaw())
    expect(result.unitOfMeasure).toBe('each')
  })

  it('converts WeightKg to grams for weightGrams', () => {
    const result = transformProduct(makeRaw({ WeightKg: 1.5 }))
    expect(result.weightGrams).toBe(1500)
  })

  it('maps dimensionsCm from LengthCm, WidthCm, HeightCm', () => {
    const result = transformProduct(makeRaw())
    expect(result.dimensionsCm).toBeDefined()
    expect(result.dimensionsCm!.length).toBe(20)
    expect(result.dimensionsCm!.width).toBe(10)
    expect(result.dimensionsCm!.height).toBe(5)
  })

  it('converts RetailPrice decimal to integer minor units (cents)', () => {
    const result = transformProduct(makeRaw({ RetailPrice: 49.99, Currency: 'USD' }))
    expect(result.retailPrice).toBeDefined()
    expect(result.retailPrice!.amount).toBe(4999)
    expect(result.retailPrice!.currency).toBe('USD')
  })

  it('maps supplierIds from DefaultSupplierSku', () => {
    const result = transformProduct(makeRaw())
    expect(result.supplierIds).toContain('VENDOR-A')
  })

  it('isActive is true when IsActive is true', () => {
    const result = transformProduct(makeRaw({ IsActive: true }))
    expect(result.isActive).toBe(true)
  })

  it('isActive is false when IsActive is false', () => {
    const result = transformProduct(makeRaw({ IsActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('maps createdAt and updatedAt as ISO strings', () => {
    const result = transformProduct(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is "tecsys"', () => {
    const result = transformProduct(makeRaw())
    expect(result.platform).toBe('tecsys')
  })

  it('passes ProductSchema validation', () => {
    const result = transformProduct(makeRaw())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
