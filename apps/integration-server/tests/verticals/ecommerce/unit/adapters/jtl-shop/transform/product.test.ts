import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawJtlShopArticle,
  type RawJtlShopVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

describe('transformProduct (jtl-shop)', () => {
  const raw: RawJtlShopArticle = {
    id: 200,
    name: 'Trail Running Shoe',
    description: '<p>Lightweight trail shoe.</p>',
    sku: 'TRS-001',
    ean: '4000000000000',
    active: true,
    price: 89.99,
    currency: 'EUR',
    images: [{ id: 1, url: 'https://cdn.example.com/shoe.jpg', alt: 'Trail Shoe', position: 0 }],
    categories: [{ id: 5, name: 'Running' }],
    variants: [
      {
        id: 300,
        articleId: 200,
        sku: 'TRS-001-42',
        ean: '4000000000001',
        price: 89.99,
        stock: 15,
        active: true,
        weight: 0.35,
        attributes: [
          { name: 'Size', value: '42' },
          { name: 'Color', value: 'Red' },
        ],
      },
    ],
    weight: 0.35,
    manufacturer: 'TrailBrand',
    urlPath: 'trail-running-shoe',
    created: '2024-03-01T00:00:00Z',
    modified: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('200')
  })

  it('maps title from name', () => {
    const result = transformProduct(raw)
    expect(result.title).toBe('Trail Running Shoe')
  })

  it('maps description', () => {
    const result = transformProduct(raw)
    expect(result.description).toBe('<p>Lightweight trail shoe.</p>')
  })

  it('maps handle from urlPath', () => {
    const result = transformProduct(raw)
    expect(result.handle).toBe('trail-running-shoe')
  })

  it('maps status from active=true → ACTIVE', () => {
    const result = transformProduct(raw)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps vendor from manufacturer', () => {
    const result = transformProduct(raw)
    expect(result.vendor).toBe('TrailBrand')
  })

  it('maps productType from categories[0].name', () => {
    const result = transformProduct(raw)
    expect(result.productType).toBe('Running')
  })

  it('maps images', () => {
    const result = transformProduct(raw)
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/shoe.jpg')
  })

  it('maps variants with minor-unit prices', () => {
    const result = transformProduct(raw)
    expect(result.variants).toHaveLength(1)
    // 89.99 EUR → 8999
    expect(result.variants![0]!.price).toEqual({ amount: 8999, currency: 'EUR' })
    expect(result.variants![0]!.sku).toBe('TRS-001-42')
  })

  it('derives product options from variant attributes', () => {
    const result = transformProduct(raw)
    const optionNames = result.options?.map((o) => o.name)
    expect(optionNames).toContain('Size')
    expect(optionNames).toContain('Color')
  })

  it('synthesises a single default variant when no variants provided', () => {
    const result = transformProduct({ ...raw, variants: [] })
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('200:default')
  })

  it('produces schema-valid output', () => {
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const result = transformProduct(raw)
    const back = untransformProduct(result)
    expect(back.name).toBe(raw.name)
    expect(back.manufacturer).toBe(raw.manufacturer)
    expect(back.active).toBe(true)
  })
})

describe('transformVariant (jtl-shop)', () => {
  const rawVariant: RawJtlShopVariant = {
    id: 300,
    articleId: 200,
    sku: 'TRS-001-42',
    ean: '4000000000001',
    prices: [{ gross: 89.99, currency: 'EUR' }],
    stock: 15,
    active: true,
    weight: 0.35,
    attributes: [{ name: 'Size', value: '42' }],
  }

  it('builds composite id from parentId:variantId', () => {
    const result = transformVariant(rawVariant, '200', 'EUR')
    expect(result.id).toBe('200:300')
  })

  it('maps productId from parentId', () => {
    const result = transformVariant(rawVariant, '200', 'EUR')
    expect(result.productId).toBe('200')
  })

  it('maps price to minor units from prices array', () => {
    const result = transformVariant(rawVariant, '200', 'EUR')
    // 89.99 EUR → 8999
    expect(result.price).toEqual({ amount: 8999, currency: 'EUR' })
  })

  it('maps weightUnit to kg', () => {
    const result = transformVariant(rawVariant, '200', 'EUR')
    expect(result.weightUnit).toBe('kg')
  })

  it('maps optionValues from attributes', () => {
    const result = transformVariant(rawVariant, '200', 'EUR')
    expect(result.optionValues).toEqual({ Size: '42' })
  })

  it('produces schema-valid output', () => {
    const result = transformVariant(rawVariant, '200', 'EUR')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})
