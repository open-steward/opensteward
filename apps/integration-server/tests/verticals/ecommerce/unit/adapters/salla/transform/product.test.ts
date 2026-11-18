import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  transformVariantFromSku,
  type RawSallaProduct,
  type RawSallaSku,
} from '../../../../../../../src/verticals/ecommerce/adapters/salla/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawSallaProduct> = {}): RawSallaProduct {
  return {
    id: 1234,
    name: 'Jasmine Tea',
    type: 'product',
    status: 'sale',
    price: { amount: 29.99, currency: 'SAR' },
    sale_price: null,
    sku: 'TEA-JAS-001',
    description: '<p>Delicate jasmine green tea.</p>',
    weight: 0.25,
    images: [
      { id: 10, url: 'https://cdn.salla.com/jasmine.jpg', main: true, alt: 'Jasmine Tea' },
    ],
    options: [
      {
        id: 50,
        name: 'Size',
        display_type: 'select',
        values: [
          { id: 1, name: '100g' },
          { id: 2, name: '250g' },
        ],
      },
    ],
    skus: [
      {
        id: 200,
        price: { amount: 29.99, currency: 'SAR' },
        stock_quantity: 50,
        sku: 'TEA-JAS-100G',
      },
    ],
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('1234')
    expect(result.title).toBe('Jasmine Tea')
    expect(result.description).toBe('<p>Delicate jasmine green tea.</p>')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('product')
  })

  it('maps out status to ACTIVE', () => {
    expect(transformProduct(makeProduct({ status: 'out' })).status).toBe('ACTIVE')
  })

  it('maps hidden status to DRAFT', () => {
    expect(transformProduct(makeProduct({ status: 'hidden' })).status).toBe('DRAFT')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.salla.com/jasmine.jpg')
    expect(result.images![0]!.alt).toBe('Jasmine Tea')
  })

  it('maps options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Size')
    expect(result.options![0]!.values).toEqual(['100g', '250g'])
  })

  it('maps skus to variants with minor-unit prices', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const variant = result.variants![0]!
    expect(variant.id).toBe('200')
    expect(variant.sku).toBe('TEA-JAS-100G')
    expect(variant.price).toEqual({ amount: 2999, currency: 'SAR' })
    expect(variant.productId).toBe('1234')
  })

  it('returns no variants when skus is empty', () => {
    const result = transformProduct(makeProduct({ skus: [] }))
    expect(result.variants).toBeUndefined()
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

  it('round-trips via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw.name).toBe('Jasmine Tea')
    expect(raw.description).toBe('<p>Delicate jasmine green tea.</p>')
    expect(raw.status).toBe('sale')
  })
})

describe('transformVariantFromSku', () => {
  it('maps sku price and falls back to product price', () => {
    const product = makeProduct({ price: { amount: 19.99, currency: 'SAR' } })
    const sku: RawSallaSku = { id: 999, price: undefined, sku: 'FALLBACK' }
    const result = transformVariantFromSku(sku, product)
    expect(result.price).toEqual({ amount: 1999, currency: 'SAR' })
  })

  it('maps compareAtPrice from regular_price', () => {
    const product = makeProduct()
    const sku: RawSallaSku = {
      id: 201,
      price: { amount: 24.99, currency: 'SAR' },
      regular_price: { amount: 29.99, currency: 'SAR' },
    }
    const result = transformVariantFromSku(sku, product)
    expect(result.compareAtPrice).toEqual({ amount: 2999, currency: 'SAR' })
  })
})
