import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawErpagProduct,
} from '../../../../../../../src/verticals/inventory/adapters/erpag/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('erpag transformProduct', () => {
  const raw: RawErpagProduct = {
    id: 'erpag-prod-001',
    basicInfo: {
      sku: 'WK-2026',
      description: 'Wireless Keyboard',
      eanUpc: '0123456789012',
      uom: 'each',
      active: true,
    },
    sellingPrice: 4999,
    productCategory: {
      productType: 'PRODUCT',
      category: 'Peripherals',
      trademark: 'Keyboards Inc',
      taxCategory: 'STANDARD',
    },
    suppliers: [{ key: 'sup-001', supplier: 'Best Supplier' }],
    inventory: [
      {
        warehouse: 'WH-MAIN',
        quantity: 100,
        available: 90,
        reserved: 10,
        onOrder: 50,
        reorderPoint: 20,
        reorderQuantity: 200,
      },
    ],
  }

  it('maps id and externalId from id field', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('erpag-prod-001')
    expect(result.externalId).toBe('erpag-prod-001')
  })

  it('maps sku from basicInfo.sku', () => {
    const result = transformProduct(raw)
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name from basicInfo.description', () => {
    const result = transformProduct(raw)
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps upc from basicInfo.eanUpc', () => {
    const result = transformProduct(raw)
    expect(result.upc).toBe('0123456789012')
  })

  it('maps unitOfMeasure from basicInfo.uom', () => {
    const result = transformProduct(raw)
    expect(result.unitOfMeasure).toBe('each')
  })

  it('maps retailPrice from sellingPrice in USD', () => {
    const result = transformProduct(raw)
    expect(result.retailPrice).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps isActive from basicInfo.active', () => {
    const result = transformProduct(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps category from productCategory.category', () => {
    const result = transformProduct(raw)
    expect(result.category).toBe('Peripherals')
  })

  it('maps supplierIds from suppliers array', () => {
    const result = transformProduct(raw)
    expect(result.supplierIds).toEqual(['sup-001'])
  })

  it('sets platform to erpag', () => {
    const result = transformProduct(raw)
    expect(result.platform).toBe('erpag')
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
