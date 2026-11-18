import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawShopifyProduct,
  type RawShopifyVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawShopifyVariant> = {}): RawShopifyVariant {
  return {
    id: 201,
    product_id: 101,
    title: 'Standard',
    price: '29.99',
    sku: 'LP-STD',
    weight: 200,
    weight_unit: 'g',
    taxable: true,
    requires_shipping: true,
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawShopifyProduct> = {}): RawShopifyProduct {
  return {
    id: 101,
    title: 'LogiProduct',
    body_html: '<p>Great product.</p>',
    handle: 'logiproduct',
    status: 'active',
    vendor: 'LogiCorp',
    tags: 'hardware',
    variants: [makeVariant()],
    images: [{ id: 401, src: 'https://cdn.example.com/product.jpg', alt: 'Product' }],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (logicommerce / Shopify)', () => {
  it('maps id to string', () => {
    const result = transformProduct(makeProduct({ id: 55 }))
    expect(result.id).toBe('55')
  })

  it('maps title', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('LogiProduct')
  })

  it('maps body_html to description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>Great product.</p>')
  })

  it('maps active status to ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps variants with price in minor units for EUR', () => {
    const result = transformProduct(makeProduct(), 'EUR')
    expect(result.variants?.[0]?.price.amount).toBe(2999) // 29.99 → 2999
    expect(result.variants?.[0]?.price.currency).toBe('EUR')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images?.[0]?.url).toBe('https://cdn.example.com/product.jpg')
  })

  it('splits comma-separated tags', () => {
    const result = transformProduct(makeProduct({ tags: 'hardware, tech' }))
    expect(result.tags).toEqual(['hardware', 'tech'])
  })

  it('stores raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformVariant (logicommerce / Shopify)', () => {
  it('maps id to string', () => {
    const result = transformVariant(makeVariant({ id: 77 }))
    expect(result.id).toBe('77')
  })

  it('converts price to minor units', () => {
    const result = transformVariant(makeVariant({ price: '29.99' }), 'EUR')
    expect(result.price.amount).toBe(2999)
  })

  it('maps sku', () => {
    const result = transformVariant(makeVariant())
    expect(result.sku).toBe('LP-STD')
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformVariant(makeVariant(), 'EUR')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (logicommerce / Shopify)', () => {
  it('round-trips title and vendor', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body.title).toBe('LogiProduct')
    expect(body.vendor).toBe('LogiCorp')
  })

  it('converts status to lowercase', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body.status).toBe('active')
  })
})
