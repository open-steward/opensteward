import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawShopifyProduct,
  type RawShopifyVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

describe('transformProduct (bold-commerce)', () => {
  const raw: RawShopifyProduct = {
    id: 8888,
    title: 'Test T-Shirt',
    body_html: '<p>Great shirt</p>',
    handle: 'test-t-shirt',
    status: 'active',
    vendor: 'Acme',
    product_type: 'Apparel',
    tags: 'sale, summer',
    options: [{ id: 1, name: 'Size', values: ['S', 'M', 'L'] }],
    variants: [
      {
        id: 101,
        product_id: 8888,
        title: 'S',
        price: '19.99',
        compare_at_price: '29.99',
        sku: 'SHIRT-S',
        barcode: '1234567890',
        position: 1,
        weight: 0.5,
        weight_unit: 'kg',
        taxable: true,
        requires_shipping: true,
        option1: 'S',
      },
    ],
    images: [
      {
        id: 55,
        src: 'https://example.com/shirt.jpg',
        alt: 'A shirt',
        width: 600,
        height: 400,
        position: 1,
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    published_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformProduct(raw).id).toBe('8888')
  })

  it('maps title correctly', () => {
    expect(transformProduct(raw).title).toBe('Test T-Shirt')
  })

  it('maps status to ACTIVE', () => {
    expect(transformProduct(raw).status).toBe('ACTIVE')
  })

  it('maps tags array', () => {
    expect(transformProduct(raw).tags).toEqual(['sale', 'summer'])
  })

  it('maps variant price to minor units', () => {
    // 19.99 USD → 1999 cents
    const variant = transformProduct(raw).variants![0]!
    expect(variant.price.amount).toBe(1999)
    expect(variant.price.currency).toBe('USD')
  })

  it('maps compareAtPrice to minor units', () => {
    // 29.99 USD → 2999 cents
    const variant = transformProduct(raw).variants![0]!
    expect(variant.compareAtPrice?.amount).toBe(2999)
  })

  it('maps option values from option1 field', () => {
    const variant = transformProduct(raw).variants![0]!
    expect(variant.optionValues?.['Size']).toBe('S')
  })

  it('maps images with url and alt', () => {
    const images = transformProduct(raw).images!
    expect(images[0]!.url).toBe('https://example.com/shirt.jpg')
    expect(images[0]!.alt).toBe('A shirt')
  })

  it('passes ProductSchema validation', () => {
    expect(() => ProductSchema.parse(transformProduct(raw))).not.toThrow()
  })
})

describe('transformVariant (bold-commerce)', () => {
  const rawVariant: RawShopifyVariant = {
    id: 200,
    product_id: 8888,
    price: '9.99',
    sku: 'SKU-01',
    weight: 1.0,
    weight_unit: 'lb',
    taxable: false,
    requires_shipping: true,
  }

  it('maps variant id to string', () => {
    expect(transformVariant(rawVariant).id).toBe('200')
  })

  it('converts price to minor units', () => {
    // 9.99 USD → 999 cents
    expect(transformVariant(rawVariant, 'USD').price.amount).toBe(999)
  })

  it('maps weight and weightUnit', () => {
    const result = transformVariant(rawVariant)
    expect(result.weight).toBe(1.0)
    expect(result.weightUnit).toBe('lb')
  })

  it('passes ProductVariantSchema validation', () => {
    expect(() => ProductVariantSchema.parse(transformVariant(rawVariant))).not.toThrow()
  })
})

describe('untransformProduct (bold-commerce)', () => {
  it('round-trips title and handle', () => {
    const raw: RawShopifyProduct = {
      id: 1,
      title: 'My Product',
      handle: 'my-product',
      status: 'active',
    }
    const canonical = transformProduct(raw)
    const body = untransformProduct(canonical)
    expect(body.title).toBe('My Product')
    expect(body.handle).toBe('my-product')
    expect(body.status).toBe('active')
  })
})
