import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawShopifyProduct,
  type RawShopifyVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopaccino/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRawProduct(overrides: Partial<RawShopifyProduct> = {}): RawShopifyProduct {
  return {
    id: 60001,
    title: 'Blue T-Shirt',
    body_html: '<p>Comfortable cotton tee</p>',
    handle: 'blue-t-shirt',
    status: 'active',
    vendor: 'ShopAccino Apparel',
    product_type: 'Tops',
    tags: 'clothing, sale',
    options: [{ id: 1, name: 'Size', position: 1, values: ['S', 'M', 'L'] }],
    variants: [
      {
        id: 70001,
        product_id: 60001,
        title: 'S',
        price: '19.99',
        compare_at_price: '24.99',
        sku: 'BTS-S',
        position: 1,
        option1: 'S',
      },
    ],
    images: [
      { id: 80001, src: 'https://cdn.shopaccino.com/blue-tee.jpg', alt: 'Blue Tee', position: 1 },
    ],
    created_at: '2024-01-15T00:00:00.000Z',
    updated_at: '2024-04-10T07:30:00.000Z',
    published_at: '2024-01-16T00:00:00.000Z',
    ...overrides,
  }
}

function makeRawVariant(overrides: Partial<RawShopifyVariant> = {}): RawShopifyVariant {
  return {
    id: 70001,
    product_id: 60001,
    title: 'M',
    price: '19.99',
    compare_at_price: '24.99',
    sku: 'BTS-M',
    position: 2,
    option1: 'M',
    taxable: true,
    requires_shipping: true,
    ...overrides,
  }
}

describe('shopaccino transformProduct', () => {
  it('maps id to string and title', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.id).toBe('60001')
    expect(result.title).toBe('Blue T-Shirt')
  })

  it('maps status from lowercase Shopify value', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps description from body_html', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.description).toBe('<p>Comfortable cotton tee</p>')
  })

  it('splits comma-separated tags', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.tags).toEqual(['clothing', 'sale'])
  })

  it('maps variants with price in minor units', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.variants).toHaveLength(1)
    // 19.99 USD = 1999 cents
    expect(result.variants![0].price.amount).toBe(1999)
    expect(result.variants![0].compareAtPrice?.amount).toBe(2499)
  })

  it('maps option values for variant via positional option1', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.variants![0].optionValues).toEqual({ Size: 'S' })
  })

  it('produces output that passes ProductSchema', () => {
    const result = transformProduct(makeRawProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const canonical = transformProduct(makeRawProduct())
    const back = untransformProduct(canonical)
    expect(back.title).toBe('Blue T-Shirt')
    expect(back.status).toBe('active')
  })
})

describe('shopaccino transformVariant', () => {
  it('maps id and productId to strings', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.id).toBe('70001')
    expect(result.productId).toBe('60001')
  })

  it('converts price to minor units', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.price.amount).toBe(1999)
    expect(result.price.currency).toBe('USD')
  })

  it('maps compareAtPrice to minor units', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.compareAtPrice?.amount).toBe(2499)
  })

  it('produces output that passes ProductVariantSchema', () => {
    const result = transformVariant(makeRawVariant())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformVariant', () => {
    const canonical = transformVariant(makeRawVariant())
    const back = untransformVariant(canonical)
    expect(back.sku).toBe('BTS-M')
    expect(back.title).toBe('M')
  })
})
