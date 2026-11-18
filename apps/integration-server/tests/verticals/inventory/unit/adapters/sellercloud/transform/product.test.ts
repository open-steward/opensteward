import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawSellercloudProduct,
} from '../../../../../../../src/verticals/inventory/adapters/sellercloud/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('sellercloud transformProduct', () => {
  const raw: RawSellercloudProduct = {
    ID: 999,
    MerchantSKU: 'KB-2024',
    ProductName: 'Wireless Keyboard',
    LongDescription: 'A great keyboard',
    UPC: '012345678901',
    BrandName: 'KeyCo',
    BrandID: 7,
    ActiveStatus: 1,
    MainProductID: null,
    VendorID: '101',
    DefaultVendorID: '202',
    WeightLbs: 1,
    ListPrice: 49.99,
    ProductTypeName: 'Peripherals',
    DateCreated: '2024-03-01T00:00:00Z',
    LastModifiedDate: '2024-06-01T00:00:00Z',
  }

  it('maps ID to id and externalId as string', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('999')
    expect(result.externalId).toBe('999')
  })

  it('maps MerchantSKU to sku', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('KB-2024')
  })

  it('maps ProductName to name', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('converts WeightLbs to grams (1 lb = 453.592 g)', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(Math.round(1 * 453.592))
  })

  it('converts ListPrice dollars to cents', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(Math.round(49.99 * 100))
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('deduplicates VendorID and DefaultVendorID into supplierIds', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toContain('101')
    expect(result.supplierIds).toContain('202')
    expect(result.supplierIds).toHaveLength(2)
  })

  it('maps ActiveStatus 1 to isActive true', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps ActiveStatus 0 to isActive false', () => {
    const inactive: RawSellercloudProduct = { ...raw, ActiveStatus: 0 }
    expect(transformProduct(inactive).isActive).toBe(false)
  })

  it('sets parentProductId to undefined when MainProductID is null', () => {
    const result = transformProduct(raw)
    expect(result.parentProductId).toBeUndefined()
  })

  it('sets parentProductId when MainProductID is a valid id', () => {
    const variant: RawSellercloudProduct = { ...raw, MainProductID: 500 }
    expect(transformProduct(variant).parentProductId).toBe('500')
  })

  it('deduplicates supplierIds when VendorID === DefaultVendorID', () => {
    const sameVendor: RawSellercloudProduct = { ...raw, VendorID: '101', DefaultVendorID: '101' }
    const result = transformProduct(sameVendor)
    expect(result.supplierIds).toHaveLength(1)
    expect(result.supplierIds[0]).toBe('101')
  })

  it('maps DateCreated to createdAt', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})
