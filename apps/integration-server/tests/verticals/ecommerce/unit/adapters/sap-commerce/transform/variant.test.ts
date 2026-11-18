import { describe, it, expect } from 'vitest'
import {
  transformVariantFromProduct,
  transformVariantFromOption,
} from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/variant'
import type { RawSapProduct, RawSapVariantOption } from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/product'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariantProduct(): RawSapProduct {
  return {
    code: 'HW-1234-BLK',
    name: 'SAP Laptop - Black',
    baseProduct: 'HW-1234',
    price: { currencyIso: 'EUR', value: 1499.99 },
  }
}

function makeVariantOption(): RawSapVariantOption {
  return {
    code: 'HW-1234-SLV',
    priceData: { currencyIso: 'EUR', value: 1549.99 },
    stock: { stockLevel: 22, stockLevelStatus: 'inStock' },
    variantOptionQualifiers: [
      { qualifier: 'color', name: 'Color', value: 'Silver' },
      { qualifier: 'size', name: 'Size', value: '15 inch' },
    ],
  }
}

describe('transformVariantFromProduct (sap-commerce)', () => {
  it('maps core fields from product data', () => {
    const r = transformVariantFromProduct(makeVariantProduct(), 'HW-1234', 1)
    expect(r.id).toBe('HW-1234-BLK')
    expect(r.productId).toBe('HW-1234')
    expect(r.sku).toBe('HW-1234-BLK')
    expect(r.title).toBe('SAP Laptop - Black')
    expect(r.price.amount).toBe(149999)
    expect(r.price.currency).toBe('EUR')
  })

  it('uses baseProduct as productId fallback', () => {
    const r = transformVariantFromProduct(makeVariantProduct())
    expect(r.productId).toBe('HW-1234')
  })

  it('maps position', () => {
    const r = transformVariantFromProduct(makeVariantProduct(), 'HW-1234', 3)
    expect(r.position).toBe(3)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariantProduct()
    const r = transformVariantFromProduct(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const r = transformVariantFromProduct(makeVariantProduct(), 'HW-1234', 1)
    expect(() => ProductVariantSchema.parse(r)).not.toThrow()
  })
})

describe('transformVariantFromOption (sap-commerce)', () => {
  it('maps core fields from variant option', () => {
    const r = transformVariantFromOption(makeVariantOption(), 'HW-1234', 2)
    expect(r.id).toBe('HW-1234-SLV')
    expect(r.productId).toBe('HW-1234')
    expect(r.price.amount).toBe(154999)
    expect(r.position).toBe(2)
  })

  it('maps option qualifiers to optionValues', () => {
    const r = transformVariantFromOption(makeVariantOption(), 'HW-1234')
    expect(r.optionValues).toEqual({ color: 'Silver', size: '15 inch' })
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const r = transformVariantFromOption(makeVariantOption(), 'HW-1234', 1)
    expect(() => ProductVariantSchema.parse(r)).not.toThrow()
  })
})
