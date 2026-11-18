/**
 * Bold Products API → Product / ProductVariant. Fixture values are the
 * documented examples in https://developer.boldcommerce.com/api/products.openapi.yaml
 * (v2Product, v2Variant, v2Option, v2OptionValue, v2Image).
 */
import { describe, it, expect } from 'vitest'
import {
  transformBoldProduct,
  transformBoldVariant,
  type RawBoldDeepProduct,
  type RawBoldVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/catalog'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

const variant: RawBoldVariant = {
  id: 789,
  shop_identifier: 'zp3oafdor9',
  platform_id: { string_value: 'platform-123', int64_value: 123456 },
  platform_product_id: { string_value: 'platform-123', int64_value: 123456 },
  name: 'Default Title',
  sku: 'BEACH-HAT-PURPLE',
  weight_unit: 'kg',
  grams: 1000,
  image_id: 321,
  image_url: 'example.store.com/files/products/hats/purple-beach-hat.jpg',
  inventory_quantity: 5,
  allow_backorder: true,
  inventory_tracking_service: 'platform',
  inventory_tracking_entity: 'product',
  created_at: '2021-11-04T19:09:52Z',
  updated_at: '2021-11-04T19:09:52Z',
  require_shipping: true,
  price: 30,
  cost: 25,
  compare_at_price: 30,
  tax_code: 'non-taxable',
  weight: 1,
  tax_exempt: true,
}

const deep: RawBoldDeepProduct = {
  product: {
    id: 123,
    shop_identifier: 'zp3oafdor9',
    platform_id: { string_value: 'platform-123', int64_value: 123456 },
    name: 'Beach hat',
    handle: 'beach-hat',
    description: 'A hat for the beach',
    type: 'Hat',
    vendor: 'OFS',
    inventory_quantity: 5,
    tags: 'hat, summer, beach',
    created_at: '2021-11-04T19:09:52Z',
    updated_at: '2021-11-04T19:09:52Z',
    published: true,
    url: 'example.store.com/files/products/hats/beach-hat.jpg',
  },
  images: [{ id: 456, src: 'https://example.com/images/beach-hat.jpg', position: 1 }],
  variants: [variant],
  options: [
    { id: 900, name: 'Small', position: 1, values: [{ id: 143, label: 'Small', position: 1 }] },
  ],
}

describe('transformBoldVariant (bold-commerce)', () => {
  it('maps the documented v2Variant and passes ProductVariantSchema', () => {
    const out = ProductVariantSchema.parse(transformBoldVariant(variant, 'CAD'))
    expect(out).toMatchObject({
      id: '789',
      sku: 'BEACH-HAT-PURPLE',
      title: 'Default Title',
      price: { amount: 3000, currency: 'CAD' },
      compareAtPrice: { amount: 3000, currency: 'CAD' },
      weight: 1000,
      weightUnit: 'g',
      taxable: false,
      requiresShipping: true,
    })
    expect(out.productId).toBeUndefined()
    expect(out.metadata).toEqual(variant)
  })

  it('scales price by the currency’s minor units', () => {
    expect(transformBoldVariant({ ...variant, price: 1500 }, 'JPY').price).toEqual({
      amount: 1500,
      currency: 'JPY',
    })
  })

  it('throws on a variant with no price instead of inventing one', () => {
    const { price: _p, ...noPrice } = variant
    expect(() => transformBoldVariant(noPrice as RawBoldVariant, 'CAD')).toThrow(/no price/)
  })

  it('omits compareAtPrice when Bold sends none', () => {
    const { compare_at_price: _c, ...rest } = variant
    expect(transformBoldVariant(rest as RawBoldVariant, 'CAD').compareAtPrice).toBeUndefined()
  })
})

describe('transformBoldProduct (bold-commerce)', () => {
  it('maps the documented v2DeepProduct and passes ProductSchema', () => {
    const out = ProductSchema.parse(transformBoldProduct(deep, 'CAD'))
    expect(out).toMatchObject({
      id: '123',
      title: 'Beach hat',
      description: 'A hat for the beach',
      handle: 'beach-hat',
      status: 'ACTIVE',
      vendor: 'OFS',
      productType: 'Hat',
      tags: ['hat', 'summer', 'beach'],
      createdAt: '2021-11-04T19:09:52.000Z',
      updatedAt: '2021-11-04T19:09:52.000Z',
      options: [{ id: '900', name: 'Small', values: ['Small'] }],
      images: [{ id: '456', url: 'https://example.com/images/beach-hat.jpg' }],
    })
    expect(out.variants).toHaveLength(1)
    expect(out.variants![0]).toMatchObject({ id: '789', productId: '123' })
  })

  it('maps published=false to DRAFT', () => {
    const out = transformBoldProduct(
      { ...deep, product: { ...deep.product, published: false } },
      'CAD',
    )
    expect(out.status).toBe('DRAFT')
  })

  it('leaves out an image URL that is neither absolute nor a path, and a handle that is not a slug', () => {
    const out = ProductSchema.parse(
      transformBoldProduct(
        {
          ...deep,
          product: { ...deep.product, handle: 'Beach Hat' },
          images: [{ id: 1, src: 'example.store.com/x.jpg' }],
        },
        'CAD',
      ),
    )
    expect(out.images).toEqual([])
    expect(out.handle).toBeUndefined()
  })

  it('throws on a product with no name', () => {
    expect(() => transformBoldProduct({ product: { id: 1 } }, 'CAD')).toThrow(/no name/)
  })
})
