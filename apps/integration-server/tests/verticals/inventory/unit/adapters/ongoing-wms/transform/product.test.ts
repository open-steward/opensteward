import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawOngoingWmsArticle,
} from '../../../../../../../src/verticals/inventory/adapters/ongoing-wms/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('ongoing-wms transformProduct', () => {
  const raw: RawOngoingWmsArticle = {
    articleSystemId: 18068,
    articleNumber: 'ART-001',
    articleName: 'Wireless Keyboard',
    description: 'Compact wireless keyboard',
    unitCode: 'each',
    isStockArticle: true,
    isObsolete: false,
    weight: 0.45,
    length: 44,
    width: 13,
    height: 3,
    customerPrice: 4999,
    purcaseCurrencyCode: 'USD',
    countryOfOriginCode: 'CN',
    barCodeInfo: { barCode: '0123456789012' },
    supplierInfo: {
      supplierNumber: 'SUP-99',
      supplierName: 'Keyboards Inc',
    },
    articleGroup: { code: 'ELEC', name: 'Electronics' },
    articleCategory: { code: 'PERIPH', name: 'Peripherals' },
    inventoryInfo: {
      numberOfItems: 250,
      sellableNumberOfItems: 240,
      lastInDate: '2024-03-01T00:00:00Z',
    },
  }

  it('maps id and externalId from articleSystemId', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('18068')
    expect(result.externalId).toBe('18068')
  })

  it('maps sku from articleNumber', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('ART-001')
  })

  it('maps name from articleName', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('converts weight from kg to grams', () => {
    const result = transformProduct(raw)
    expect(result.weightGrams).toBe(450)
  })

  it('maps retailPrice from customerPrice', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice?.amount).toBe(4999)
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('maps isActive from inverse of isObsolete', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps supplierIds from supplierInfo.supplierNumber', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toContain('SUP-99')
  })

  it('maps category from articleCategory.name', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Peripherals')
  })

  it('maps createdAt from inventoryInfo.lastInDate', () => {
    const result = transformProduct(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to ongoing-wms', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('ongoing-wms')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
