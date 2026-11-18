import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawStockTrimProduct,
} from '../../../../../../../src/verticals/inventory/adapters/stocktrim/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/inventory/schema/product'

describe('transformProduct — stocktrim', () => {
  const raw: RawStockTrimProduct = {
    productId: 'PROD-001',
    productCodeReadable: 'WK-2026',
    name: 'Wireless Keyboard',
    category: 'Peripherals',
    subCategory: 'Bluetooth',
    barcode: '0123456789012',
    price: 49.99,
    supplierCode: 'SUPP-10',
    suppliers: [{ supplierId: 'SUPP-10', supplierName: 'Keyboards Inc' }],
    weight: 0.45,
    length: 44,
    width: 13,
    height: 3,
    discontinued: false,
    unstocked: false,
    leadTime: 14,
    minimumOrderQuantity: 10,
  }
  const result = transformProduct(raw)

  it('maps id from productId', () => {
    expect(result.id).toBe('PROD-001')
  })

  it('maps sku from productCodeReadable', () => {
    expect(result.sku).toBe('WK-2026')
  })

  it('maps name', () => {
    expect(result.name).toBe('Wireless Keyboard')
  })

  it('maps category', () => {
    expect(result.category).toBe('Peripherals')
  })

  it('maps upc from barcode', () => {
    expect(result.upc).toBe('0123456789012')
  })

  it('converts price float to integer minor units (cents)', () => {
    // 49.99 * 100 = 4999
    expect(result.retailPrice?.amount).toBe(4999)
  })

  it('sets retailPrice currency to USD', () => {
    expect(result.retailPrice?.currency).toBe('USD')
  })

  it('deduplicates supplierIds (supplierCode + suppliers array)', () => {
    // supplierCode 'SUPP-10' and suppliers[0].supplierId 'SUPP-10' → deduplicated to one
    expect(result.supplierIds).toEqual(['SUPP-10'])
  })

  it('converts weight from kg to grams (1000 g/kg)', () => {
    expect(result.weightGrams).toBeCloseTo(450, 0)
  })

  it('maps dimensionsCm.length from length', () => {
    expect(result.dimensionsCm?.length).toBe(44)
  })

  it('sets isActive true when not discontinued and not unstocked', () => {
    expect(result.isActive).toBe(true)
  })

  it('sets unitOfMeasure to each', () => {
    expect(result.unitOfMeasure).toBe('each')
  })

  it('sets platform to stocktrim', () => {
    expect(result.platform).toBe('stocktrim')
  })

  it('stores leadTime in metadata', () => {
    expect(result.metadata['leadTime']).toBe('14')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — stocktrim discontinued/unstocked', () => {
  const raw: RawStockTrimProduct = {
    productId: 'PROD-OLD',
    discontinued: true,
  }
  const result = transformProduct(raw)

  it('sets isActive false when discontinued', () => {
    expect(result.isActive).toBe(false)
  })

  it('falls back sku to productId when productCodeReadable absent', () => {
    expect(result.sku).toBe('PROD-OLD')
  })

  it('passes schema validation', () => {
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProduct — stocktrim parentId variant', () => {
  const raw: RawStockTrimProduct = {
    productId: 'PROD-VAR',
    parentId: 'PROD-PARENT',
    variantType: 'color',
    variant: 'red',
  }
  const result = transformProduct(raw)

  it('maps parentProductId from parentId', () => {
    expect(result.parentProductId).toBe('PROD-PARENT')
  })

  it('stores variantType in metadata', () => {
    expect(result.metadata['variantType']).toBe('color')
  })
})
