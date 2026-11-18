import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  type RawShift4ShopProduct,
  type RawShift4ShopSKU,
} from '../../../../../../../src/verticals/ecommerce/adapters/shift4shop/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeSKU(overrides: Partial<RawShift4ShopSKU> = {}): RawShift4ShopSKU {
  return {
    SKUInfo: {
      SKUID: 101,
      SKUCode: 'SHIRT-S-RED',
      SKUPrice: 24.99,
      SKURetailPrice: 29.99,
      SKUStock: 50,
      SKUWeight: 0.5,
      SKUBarCode: '123456789012',
    },
    SKUOptionValues: [
      { OptionName: 'Size', OptionValue: 'S' },
      { OptionName: 'Color', OptionValue: 'Red' },
    ],
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawShift4ShopProduct> = {}): RawShift4ShopProduct {
  return {
    CatalogID: 42,
    ProductName: 'Classic Red Shirt',
    Price: 24.99,
    ListPrice: 29.99,
    MFGID: 'SHIRT-BASE',
    UPC: '000000000042',
    Description: '<p>A classic red shirt.</p>',
    Discontinued: false,
    CategoryID: 5,
    Stock: 100,
    Weight: 0.5,
    MainImageFile: 'https://example.com/img/shirt.jpg',
    MainImageCaption: 'Classic Red Shirt',
    ExtraImage1: 'https://example.com/img/shirt2.jpg',
    Keywords: 'shirt, casual, red',
    DateAdded: '2024-01-10T12:00:00.000Z',
    DateModified: '2024-02-01T09:00:00.000Z',
    SKUInfo: [makeSKU()],
    ...overrides,
  }
}

describe('transformProduct (Shift4Shop)', () => {
  it('maps core fields and stringifies ids', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Classic Red Shirt')
    expect(result.description).toBe('<p>A classic red shirt.</p>')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps active product to ACTIVE status', () => {
    const result = transformProduct(makeProduct({ Discontinued: false }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps discontinued=true to ARCHIVED status', () => {
    const result = transformProduct(makeProduct({ Discontinued: true }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps discontinued=1 (numeric) to ARCHIVED status', () => {
    const result = transformProduct(makeProduct({ Discontinued: 1 }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps discontinued="1" (string) to ARCHIVED status', () => {
    const result = transformProduct(makeProduct({ Discontinued: '1' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps variant SKUs with composite id and optionValues', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('101')
    expect(v.productId).toBe('42')
    expect(v.sku).toBe('SHIRT-S-RED')
    expect(v.barcode).toBe('123456789012')
    expect(v.price).toEqual({ amount: 2499, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 2999, currency: 'USD' })
    expect(v.optionValues).toEqual({ Size: 'S', Color: 'Red' })
    expect(v.weight).toBe(0.5)
    expect(v.weightUnit).toBe('lb')
  })

  it('synthesises a default variant when no SKUInfo present', () => {
    const result = transformProduct(makeProduct({ SKUInfo: [] }))
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('42:default')
    expect(v.sku).toBe('SHIRT-BASE')
    expect(v.barcode).toBe('000000000042')
    expect(v.price).toEqual({ amount: 2499, currency: 'USD' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('maps main image and extra images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toBeDefined()
    expect(result.images!.length).toBeGreaterThanOrEqual(1)
    expect(result.images![0]!.url).toBe('https://example.com/img/shirt.jpg')
    expect(result.images![0]!.alt).toBe('Classic Red Shirt')
    expect(result.images![0]!.position).toBe(1)
    expect(result.images![1]!.url).toBe('https://example.com/img/shirt2.jpg')
  })

  it('maps keywords to tags array', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['shirt', 'casual', 'red'])
  })

  it('returns undefined tags when no keywords', () => {
    const result = transformProduct(makeProduct({ Keywords: null }))
    expect(result.tags).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-10T12:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T09:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid result for product without SKUs', () => {
    const result = transformProduct(makeProduct({ SKUInfo: [] }))
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('handles null/undefined root price gracefully — uses SKU price', () => {
    // When root Price is null but SKU has a price, the SKU price is used.
    const result = transformProduct(makeProduct({ Price: null }))
    // SKU has SKUPrice: 24.99, so variant price should be 2499 minor units.
    expect(result.variants![0]!.price.amount).toBe(2499)
  })

  it('falls back to 0 price when both root and SKU price are null', () => {
    const skuNoPrice = makeSKU({ SKUInfo: { SKUID: 101, SKUCode: 'X', SKUPrice: null } })
    const result = transformProduct(makeProduct({ Price: null, SKUInfo: [skuNoPrice] }))
    expect(result.variants![0]!.price.amount).toBe(0)
  })

  it('handles multiple SKU variants', () => {
    const sku2 = makeSKU({
      SKUInfo: {
        SKUID: 102,
        SKUCode: 'SHIRT-M-RED',
        SKUPrice: 24.99,
        SKUStock: 30,
      },
      SKUOptionValues: [{ OptionName: 'Size', OptionValue: 'M' }],
    })
    const result = transformProduct(makeProduct({ SKUInfo: [makeSKU(), sku2] }))
    expect(result.variants).toHaveLength(2)
    expect(result.variants![1]!.id).toBe('102')
  })
})

describe('transformProductVariant (Shift4Shop) standalone', () => {
  it('builds a canonical variant from raw SKU', () => {
    const v = transformProductVariant(makeSKU(), '42', 'USD', 2000)
    expect(v.id).toBe('101')
    expect(v.productId).toBe('42')
    expect(v.sku).toBe('SHIRT-S-RED')
    expect(v.price).toEqual({ amount: 2499, currency: 'USD' })
    expect(v.weight).toBe(0.5)
    expect(v.weightUnit).toBe('lb')
  })

  it('uses fallback price when SKUPrice is zero/null', () => {
    const sku = makeSKU({
      SKUInfo: { SKUID: 201, SKUCode: 'X', SKUPrice: 0 },
    })
    const v = transformProductVariant(sku, '99', 'USD', 1500)
    expect(v.price.amount).toBe(1500)
  })

  it('sets optionValues from SKUOptionValues', () => {
    const v = transformProductVariant(makeSKU(), '42')
    expect(v.optionValues).toEqual({ Size: 'S', Color: 'Red' })
  })

  it('handles empty SKUOptionValues gracefully', () => {
    const sku = makeSKU({ SKUOptionValues: [] })
    const v = transformProductVariant(sku, '42')
    expect(v.optionValues).toBeUndefined()
  })

  it('sets metadata to raw SKU object', () => {
    const raw = makeSKU()
    const v = transformProductVariant(raw, '42')
    expect(v.metadata).toBe(raw)
  })
})
