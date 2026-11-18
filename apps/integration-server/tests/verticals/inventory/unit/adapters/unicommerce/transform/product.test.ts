import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawUnicommerceProduct,
} from '../../../../../../../src/verticals/inventory/adapters/unicommerce/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

function makeRaw(overrides: Partial<RawUnicommerceProduct> = {}): RawUnicommerceProduct {
  return {
    id: 42,
    skuCode: 'SKU-001',
    name: 'Wireless Keyboard',
    description: 'Bluetooth keyboard',
    ean: '0123456789012',
    upc: '9876543210987',
    scanIdentifier: 'SCAN-001',
    brand: 'KeyCo',
    color: 'Black',
    size: 'Full',
    categoryCode: 'ELEC',
    categoryName: 'Electronics',
    type: 'STANDARD',
    skuType: 'SIMPLE',
    length: 44,
    width: 13,
    height: 3,
    weight: 450,
    maxRetailPrice: 2999,
    basePrice: 2500,
    costPrice: 1800,
    enabled: true,
    expirable: false,
    shelfLife: 0,
    hsnCode: '8471',
    taxTypeCode: 'GST18',
    gstTaxTypeCode: 'GST18',
    tags: ['keyboard', 'bluetooth'],
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (unicommerce)', () => {
  it('maps id, externalId, and sku from skuCode', () => {
    const result = transformProduct(makeRaw({ skuCode: 'SKU-001' }))
    expect(result.id).toBe('SKU-001')
    expect(result.externalId).toBe('SKU-001')
    expect(result.sku).toBe('SKU-001')
  })

  it('falls back id to stringified numeric id when skuCode is absent', () => {
    const result = transformProduct(makeRaw({ skuCode: undefined, id: 42 }))
    expect(result.id).toBe('42')
    expect(result.sku).toBe('42')
  })

  it('maps name and description', () => {
    const result = transformProduct(makeRaw())
    expect(result.name).toBe('Wireless Keyboard')
    expect(result.description).toBe('Bluetooth keyboard')
  })

  it('maps upc from upc field (preferred over ean and scanIdentifier)', () => {
    const result = transformProduct(makeRaw({ upc: '9876543210987', ean: '0123456789012' }))
    expect(result.upc).toBe('9876543210987')
  })

  it('falls back upc to ean when upc is absent', () => {
    const result = transformProduct(makeRaw({ upc: undefined, ean: '0123456789012' }))
    expect(result.upc).toBe('0123456789012')
  })

  it('falls back upc to scanIdentifier when upc and ean are absent', () => {
    const result = transformProduct(
      makeRaw({ upc: undefined, ean: undefined, scanIdentifier: 'SCAN-001' }),
    )
    expect(result.upc).toBe('SCAN-001')
  })

  it('maps category from categoryName (preferred over categoryCode)', () => {
    const result = transformProduct(makeRaw({ categoryName: 'Electronics', categoryCode: 'ELEC' }))
    expect(result.category).toBe('Electronics')
  })

  it('falls back category to categoryCode when categoryName is absent', () => {
    const result = transformProduct(makeRaw({ categoryName: undefined, categoryCode: 'ELEC' }))
    expect(result.category).toBe('ELEC')
  })

  it('maps weightGrams from weight (already in grams)', () => {
    const result = transformProduct(makeRaw({ weight: 450 }))
    expect(result.weightGrams).toBe(450)
  })

  it('maps dimensionsCm from length/width/height (already in cm)', () => {
    const result = transformProduct(makeRaw({ length: 44, width: 13, height: 3 }))
    expect(result.dimensionsCm).toEqual({ length: 44, width: 13, height: 3 })
  })

  it('omits dimensionsCm when all dimension fields are absent', () => {
    const result = transformProduct(
      makeRaw({ length: undefined, width: undefined, height: undefined }),
    )
    expect(result.dimensionsCm).toBeUndefined()
  })

  it('maps retailPrice from maxRetailPrice with INR currency (value as-is, no conversion)', () => {
    const result = transformProduct(makeRaw({ maxRetailPrice: 2999 }))
    expect(result.retailPrice).toEqual({ amount: 2999, currency: 'INR' })
  })

  it('omits retailPrice when maxRetailPrice is absent', () => {
    const result = transformProduct(makeRaw({ maxRetailPrice: undefined }))
    expect(result.retailPrice).toBeUndefined()
  })

  it('isActive is true when enabled is true', () => {
    expect(transformProduct(makeRaw({ enabled: true })).isActive).toBe(true)
  })

  it('isActive is false when enabled is false', () => {
    expect(transformProduct(makeRaw({ enabled: false })).isActive).toBe(false)
  })

  it('isActive defaults to true when enabled is absent', () => {
    expect(transformProduct(makeRaw({ enabled: undefined })).isActive).toBe(true)
  })

  it('supplierIds is always an empty array', () => {
    expect(transformProduct(makeRaw()).supplierIds).toEqual([])
  })

  it('maps createdAt and updatedAt from ISO date strings', () => {
    const result = transformProduct(
      makeRaw({ created: '2024-03-01T00:00:00Z', updated: '2024-03-01T00:00:00Z' }),
    )
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps createdAt from epoch millis', () => {
    const epoch = new Date('2024-03-01T00:00:00Z').getTime()
    const result = transformProduct(makeRaw({ created: epoch, updated: undefined }))
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('platform is "unicommerce"', () => {
    expect(transformProduct(makeRaw()).platform).toBe('unicommerce')
  })

  it('passes ProductSchema validation', () => {
    const result = transformProduct(makeRaw())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
