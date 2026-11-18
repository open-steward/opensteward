import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawIqmetrixCatalogItem,
} from '../../../../../../../src/verticals/inventory/adapters/iqmetrix/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — iqmetrix catalog item with product details', () => {
  const raw: RawIqmetrixCatalogItem = {
    CatalogItemId: 'cat-uuid-001',
    CatalogSku: 'CSKU001',
    Slug: 'M1248-V1',
    RmsId: 'CUSTOMER-SKU-001',
    DateAddedUtc: '2024-03-01T00:00:00Z',
    DateUpdatedUtc: '2024-03-01T00:00:00Z',
    IsArchived: false,
    LifeCycle: 'Active',
    MeasurementType: 'each',
    _productDetails: {
      Id: 'pd-uuid-001',
      Name: 'Wireless Keyboard',
      ShortDescription: 'BT keyboard',
      LongDescription: 'Bluetooth wireless keyboard, US layout.',
      Manufacturer: { Id: 5, Name: 'Keyboards Inc' },
      UpcCodes: [{ Value: '0123456789012' }],
      ManufacturerSkus: [{ Value: 'MFR-KB-001', EntityId: 5 }],
      VendorSkus: [{ Value: 'VS-001', EntityId: 999, EntityName: 'Vendor A' }],
      MSRP: { Amount: 49.99, CurrencyCode: 'USD' },
      CanonicalClassification: { Id: 10, Name: 'Peripherals' },
    },
  }
  const result = transformProduct(raw)

  it('sets id from CatalogItemId', () => {
    expect(result.id).toBe('cat-uuid-001')
  })

  it('prefers RmsId as sku over CatalogSku', () => {
    expect(result.sku).toBe('CUSTOMER-SKU-001')
  })

  it('sets name from productDetails.Name', () => {
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('sets brand from Manufacturer.Name', () => {
    expect(result.brand).toBe('Keyboards Inc')
  })

  it('sets upc from first UpcCode', () => {
    expect(result.upc).toBe('0123456789012')
  })

  it('sets retailPrice.amount as cents from MSRP.Amount', () => {
    expect(result.retailPrice?.amount).toBe(4999)
  })

  it('sets retailPrice.currency from MSRP.CurrencyCode', () => {
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('sets category from CanonicalClassification.Name', () => {
    expect(result.category).toBe('Peripherals')
  })

  it('sets supplierIds from VendorSkus[].EntityId', () => {
    expect(result.supplierIds).toEqual(['999'])
  })

  it('sets isActive to true for LifeCycle=Active', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets platform to iqmetrix', () => {
    expect(result.platform).toBe('iqmetrix')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — archived item without product details', () => {
  const raw: RawIqmetrixCatalogItem = {
    CatalogItemId: 'cat-uuid-002',
    CatalogSku: 'ARCH-001',
    LifeCycle: 'Archived',
    IsArchived: true,
  }
  const result = transformProduct(raw)

  it('sets sku from CatalogSku when RmsId absent', () => {
    expect(result.sku).toBe('ARCH-001')
  })

  it('sets isActive to false for archived item', () => {
    expect(result.isActive).toBe(false)
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
