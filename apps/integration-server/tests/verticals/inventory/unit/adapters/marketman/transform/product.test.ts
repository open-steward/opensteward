import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawMarketmanProduct,
} from '../../../../../../../src/verticals/inventory/adapters/marketman/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('marketman transformProduct', () => {
  const raw: RawMarketmanProduct = {
    ID: '42',
    Name: 'Olive Oil',
    CategoryName: 'Oils',
    UOMName: 'litre',
    IsDeleted: false,
    UpdateDate: '2024-03-01T00:00:00Z',
    PurchaseItems: [
      {
        VendorGuid: 'vendor-guid-1',
        ProductCode: 'OLV-001',
        ScanBarCode: '1234567890',
        Price: 9.99,
      },
    ],
    GUID: 'buyer-guid-abc',
  }

  it('maps id and externalId from ID', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps name from Name field', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Olive Oil')
  })

  it('maps sku from first PurchaseItem ProductCode', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('OLV-001')
  })

  it('maps upc from first PurchaseItem ScanBarCode', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('1234567890')
  })

  it('maps category from CategoryName', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Oils')
  })

  it('maps unitOfMeasure from UOMName', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('litre')
  })

  it('maps supplierIds from VendorGuid in PurchaseItems', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['vendor-guid-1'])
  })

  it('sets isActive true when IsDeleted is false', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when IsDeleted is true', () => {
    const result = transformProduct({ ...raw, IsDeleted: true })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to marketman', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('marketman')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
