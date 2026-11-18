import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type RawTrendyolProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/trendyol/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawTrendyolProduct> = {}): RawTrendyolProduct {
  return {
    barcode: '8690000000001',
    productMainId: 'MAIN-001',
    title: 'Smart Headphones Pro',
    description: 'Premium wireless headphones',
    brandId: 100,
    brandName: 'TechBrand',
    categoryId: 411,
    categoryName: 'Electronics',
    stockCode: 'sku-hp-001',
    quantity: 10,
    salePrice: 299.99,
    listPrice: 399.99,
    currencyType: 'TRY',
    approved: true,
    archived: false,
    contentId: 55555,
    images: [{ url: 'https://cdn.example.com/hp.jpg' }],
    attributes: [
      { attributeId: 1, attributeName: 'Color', attributeValue: 'Black', customAttributeValue: 'Midnight Black' },
    ],
    createDateTime: 1704067200000, // 2024-01-01T00:00:00.000Z
    lastModifiedDate: 1704153600000, // 2024-01-02T00:00:00.000Z
    ...overrides,
  }
}

describe('transformProduct (Trendyol)', () => {
  it('maps id from barcode, title, vendor from brandName', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('8690000000001')
    expect(result.title).toBe('Smart Headphones Pro')
    expect(result.vendor).toBe('TechBrand')
  })

  it('maps handle from stockCode', () => {
    // stockCode is used as handle; falls back to barcode
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('sku-hp-001')
  })

  it('maps status: approved=true, archived=false → ACTIVE', () => {
    const result = transformProduct(makeProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status: approved=false → DRAFT', () => {
    const result = transformProduct(makeProduct({ approved: false, archived: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status: archived=true → ARCHIVED', () => {
    const result = transformProduct(makeProduct({ archived: true }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('includes one variant and converts salePrice to minor units', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.price.amount).toBe(29999)
    expect(result.variants![0]!.price.currency).toBe('TRY')
  })

  it('sets compareAtPrice when listPrice > salePrice', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants![0]!.compareAtPrice?.amount).toBe(39999)
  })

  it('maps images array', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/hp.jpg')
  })

  it('converts epoch ms timestamps to ISO strings', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-01-02T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProductVariant (Trendyol)', () => {
  it('maps barcode as id and sku from stockCode', () => {
    const result = transformProductVariant(makeProduct(), 'TRY')
    expect(result.id).toBe('8690000000001')
    expect(result.barcode).toBe('8690000000001')
    expect(result.sku).toBe('sku-hp-001')
  })

  it('converts sale price to minor units', () => {
    const result = transformProductVariant(makeProduct(), 'TRY')
    expect(result.price.amount).toBe(29999)
    expect(result.price.currency).toBe('TRY')
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformProductVariant(makeProduct(), 'TRY')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (Trendyol)', () => {
  it('round-trips title and description', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical, { barcode: '8690000000001', categoryId: 411, brandId: 100 })
    expect(body['title']).toBe('Smart Headphones Pro')
    expect(body['description']).toBe('Premium wireless headphones')
  })

  it('converts minor-unit salePrice back to decimal major', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical, { barcode: '8690000000001', categoryId: 411, brandId: 100 })
    expect(body['salePrice']).toBeCloseTo(299.99, 1)
  })
})
