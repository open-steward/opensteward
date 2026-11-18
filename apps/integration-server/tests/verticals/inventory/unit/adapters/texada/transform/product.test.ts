import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawTexadaProduct,
} from '../../../../../../../src/verticals/inventory/adapters/texada/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct', () => {
  const base: RawTexadaProduct = {
    itemNo: 'ITEM-001',
    description: 'Cat 320 Excavator',
    modelNo: 'CAT-320',
    category: 'Excavators',
    manufacturer: 'Caterpillar',
    unitOfMeasure: 'each',
    dailyRate: 150.0,
    weeklyRate: 900.0,
    monthlyRate: 3200.0,
    active: true,
    weightKg: 22000,
    lengthCm: 950,
    widthCm: 290,
    heightCm: 300,
    primaryVendorId: 'vendor-42',
    createdDate: '2024-03-01T00:00:00Z',
    modifiedDate: '2024-06-15T12:00:00Z',
  }

  it('maps itemNo → id and externalId', () => {
    const result = transformProduct(base)
    expect(result.id).toBe('ITEM-001')
    expect(result.externalId).toBe('ITEM-001')
  })

  it('maps modelNo → sku', () => {
    const result = transformProduct(base)
    expect(result.sku).toBe('CAT-320')
  })

  it('maps description → name', () => {
    const result = transformProduct(base)
    expect(result.name).toBe('Cat 320 Excavator')
  })

  it('maps manufacturer → brand', () => {
    const result = transformProduct(base)
    expect(result.brand).toBe('Caterpillar')
  })

  it('maps category → category', () => {
    const result = transformProduct(base)
    expect(result.category).toBe('Excavators')
  })

  it('converts dailyRate dollars to minor units for retailPrice', () => {
    const result = transformProduct(base)
    expect(result.retailPrice).toEqual({ amount: 15000, currency: 'USD' })
  })

  it('falls back to salePrice when dailyRate is absent', () => {
    const { dailyRate, ...rest } = base
    const result = transformProduct({ ...rest, salePrice: 25.99 })
    expect(result.retailPrice).toEqual({ amount: 2599, currency: 'USD' })
  })

  it('leaves retailPrice undefined when neither dailyRate nor salePrice are present', () => {
    const { dailyRate, ...rest } = base
    const result = transformProduct({ ...rest })
    expect(result.retailPrice).toBeUndefined()
  })

  it('converts weightKg to grams for weightGrams', () => {
    const result = transformProduct(base)
    expect(result.weightGrams).toBe(22000 * 1000)
  })

  it('builds dimensionsCm from lengthCm/widthCm/heightCm', () => {
    const result = transformProduct(base)
    expect(result.dimensionsCm).toEqual({ length: 950, width: 290, height: 300 })
  })

  it('omits dimensionsCm when no dimension fields are present', () => {
    const { lengthCm, widthCm, heightCm, ...rest } = base
    const result = transformProduct(rest)
    expect(result.dimensionsCm).toBeUndefined()
  })

  it('maps primaryVendorId → supplierIds array', () => {
    const result = transformProduct(base)
    expect(result.supplierIds).toEqual(['vendor-42'])
  })

  it('falls back vendorId when primaryVendorId is absent', () => {
    const { primaryVendorId, ...rest } = base
    const result = transformProduct({ ...rest, vendorId: 'vendor-99' })
    expect(result.supplierIds).toEqual(['vendor-99'])
  })

  it('yields empty supplierIds when no vendor id is present', () => {
    const { primaryVendorId, ...rest } = base
    const result = transformProduct(rest)
    expect(result.supplierIds).toEqual([])
  })

  it('maps createdDate → createdAt as ISO string', () => {
    const result = transformProduct(base)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps modifiedDate → updatedAt as ISO string', () => {
    const result = transformProduct(base)
    expect(result.updatedAt).toBe('2024-06-15T12:00:00.000Z')
  })

  it('falls back lastModified → updatedAt when modifiedDate is absent', () => {
    const { modifiedDate, ...rest } = base
    const result = transformProduct({ ...rest, lastModified: '2024-07-01T00:00:00Z' })
    expect(result.updatedAt).toBe('2024-07-01T00:00:00.000Z')
  })

  it('resolves isActive from boolean active', () => {
    const result = transformProduct(base)
    expect(result.isActive).toBe(true)
  })

  it('resolves isActive from string "1"', () => {
    const result = transformProduct({ ...base, active: '1' })
    expect(result.isActive).toBe(true)
  })

  it('resolves isActive via status when active is absent', () => {
    const { active, ...rest } = base
    const result = transformProduct({ ...rest, status: 'inactive' })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to "texada"', () => {
    const result = transformProduct(base)
    expect(result.platform).toBe('texada')
  })

  it('defaults unitOfMeasure to "each" when absent', () => {
    const { unitOfMeasure, ...rest } = base
    const result = transformProduct(rest)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('falls back id → id when itemNo is absent', () => {
    const { itemNo, ...rest } = base
    const result = transformProduct({ ...rest, id: 'fallback-id' })
    expect(result.id).toBe('fallback-id')
  })

  it('falls back productGroup → category when category is absent', () => {
    const { category, ...rest } = base
    const result = transformProduct({ ...rest, productGroup: 'Heavy Equipment' })
    expect(result.category).toBe('Heavy Equipment')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(base)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
