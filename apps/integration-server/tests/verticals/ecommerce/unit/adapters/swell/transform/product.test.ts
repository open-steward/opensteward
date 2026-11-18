/**
 * Swell product / variant transforms, against the documented examples:
 *  - "The product model" (https://developers.swell.is/backend-api/products)
 *  - "List all variants" response (https://developers.swell.is/backend-api/variants)
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  type RawSwellProduct,
  type RawSwellVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/swell/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

/** The documented product model example (subset of its fields, values verbatim). */
const DOC_PRODUCT: RawSwellProduct = {
  name: 'Iron dagger',
  sku: '00090616',
  active: true,
  variable: true,
  description:
    '<h3>Damage: 7</h3><h3>Weight: 8</h3><h3>Health: 98</h3><h3>Speed: 1.4</h3><h3>Reach: 0.6</h3>',
  tags: [],
  slug: 'iron-dagger',
  delivery: 'shipment',
  price: 10,
  stock_tracking: false,
  options: [
    {
      id: '627c6e36e80393798c171670',
      values: [
        { id: '627c6f18e80393798c171673', name: 'Fine', price: null },
        { id: '627c6f18e80393798c171674', name: 'Rusty', price: 0 },
      ],
      name: 'Type',
      active: true,
      input_type: 'select',
      variant: true,
      required: true,
      attribute_id: 'type',
    },
  ],
  currency: 'USD',
  sale: false,
  sale_price: null,
  type: 'standard',
  tax_class: 'standard',
  date_created: '2022-05-12T02:21:12.534Z',
  date_updated: '2022-05-12T02:37:45.666Z',
  id: '627c6f180d375a001296b580',
}

/** The documented "List all variants" result row, verbatim. */
const DOC_VARIANT: RawSwellVariant = {
  id: '5c8fb5e1ed2faf8c79da492a',
  parent_id: '5ca24abb9c077817e5fe2b36',
  name: 'Blue, Small',
  active: true,
  currency: 'USD',
  date_created: '2019-04-01T00:00:00.000Z',
  date_updated: '2019-04-01T00:00:00.000Z',
  price: 19.98,
}

describe('swell transformProduct', () => {
  it('maps the documented product example and parses as a Product', () => {
    const p = ProductSchema.parse(transformProduct(DOC_PRODUCT))
    expect(p.id).toBe('627c6f180d375a001296b580')
    expect(p.title).toBe('Iron dagger')
    expect(p.handle).toBe('iron-dagger')
    expect(p.status).toBe('ACTIVE')
    expect(p.productType).toBe('standard')
    expect(p.tags).toBeUndefined()
    expect(p.options).toEqual([
      { id: '627c6e36e80393798c171670', name: 'Type', values: ['Fine', 'Rusty'] },
    ])
    expect(p.variants).toBeUndefined()
    expect(p.createdAt).toBe('2022-05-12T02:21:12.534Z')
    expect(p.updatedAt).toBe('2022-05-12T02:37:45.666Z')
    expect(p.vendor).toBeUndefined()
  })

  it('maps an inactive product to DRAFT and images from file.url', () => {
    const p = ProductSchema.parse(
      transformProduct({
        ...DOC_PRODUCT,
        active: false,
        images: [
          {
            id: 'img1',
            caption: 'Side',
            file: { url: 'https://cdn.schema.io/x/1', width: 127, height: 127 },
          },
          { id: 'img2', file: null },
        ],
      }),
    )
    expect(p.status).toBe('DRAFT')
    expect(p.images).toEqual([
      {
        id: 'img1',
        url: 'https://cdn.schema.io/x/1',
        alt: 'Side',
        width: 127,
        height: 127,
        position: 0,
      },
    ])
  })
})

describe('swell transformProductVariant', () => {
  it('maps the documented variant row and parses as a ProductVariant', () => {
    const v = ProductVariantSchema.parse(transformProductVariant(DOC_VARIANT))
    expect(v.id).toBe('5c8fb5e1ed2faf8c79da492a')
    expect(v.productId).toBe('5ca24abb9c077817e5fe2b36')
    expect(v.title).toBe('Blue, Small')
    expect(v.price).toEqual({ amount: 1998, currency: 'USD' })
    expect(v.compareAtPrice).toBeUndefined()
  })

  it("inherits the expanded parent's price and resolves option values", () => {
    const v = ProductVariantSchema.parse(
      transformProductVariant({
        id: 'var1',
        parent_id: DOC_PRODUCT.id,
        currency: 'USD',
        option_value_ids: ['627c6f18e80393798c171674'],
        parent: DOC_PRODUCT,
      }),
    )
    expect(v.price).toEqual({ amount: 1000, currency: 'USD' })
    expect(v.optionValues).toEqual({ Type: 'Rusty' })
    expect(v.metadata).not.toHaveProperty('parent')
  })

  it('maps orig_price above price to compareAtPrice', () => {
    const v = ProductVariantSchema.parse(
      transformProductVariant({ ...DOC_VARIANT, orig_price: 24.99 }),
    )
    expect(v.compareAtPrice).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('leaves compareAtPrice unset when orig_price is not above price (no sale)', () => {
    for (const orig of [19.98, 10]) {
      const v = ProductVariantSchema.parse(
        transformProductVariant({ ...DOC_VARIANT, orig_price: orig }),
      )
      expect(v.compareAtPrice).toBeUndefined()
    }
  })

  it('refuses a variant with no price anywhere, or no currency', () => {
    expect(() => transformProductVariant({ ...DOC_VARIANT, price: null })).toThrow(
      /no price or currency/,
    )
    expect(() => transformProductVariant({ ...DOC_VARIANT, currency: undefined })).toThrow(
      /no price or currency/,
    )
  })
})
