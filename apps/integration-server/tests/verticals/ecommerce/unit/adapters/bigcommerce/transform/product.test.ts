import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  transformVariant,
  type RawBigCommerceProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcommerce/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawBigCommerceProduct> = {}): RawBigCommerceProduct {
  return {
    id: 112,
    name: 'Classic T-Shirt',
    description: '<p>A comfortable cotton tee.</p>',
    sku: 'TEE-001',
    type: 'physical',
    weight: 0.4,
    price: 19.99,
    is_visible: true,
    availability: 'available',
    custom_url: { url: '/classic-t-shirt/' },
    categories: [1, 5],
    variants: [
      {
        id: 201,
        product_id: 112,
        sku: 'TEE-S-RED',
        price: 19.99,
        retail_price: 24.99,
        weight: 0.4,
        sort_order: 1,
        option_values: [
          { option_display_name: 'Size', label: 'S' },
          { option_display_name: 'Color', label: 'Red' },
        ],
      },
    ],
    images: [
      {
        id: 301,
        sort_order: 0,
        url_standard: 'https://cdn.bigcommerce.com/img/tee.jpg',
        description: 'Front view',
      },
    ],
    options: [
      {
        id: 401,
        display_name: 'Size',
        sort_order: 0,
        option_values: [{ label: 'S' }, { label: 'M' }, { label: 'L' }],
      },
      {
        id: 402,
        display_name: 'Color',
        sort_order: 1,
        option_values: [{ label: 'Red' }, { label: 'Blue' }],
      },
    ],
    date_created: '2024-01-10T12:00:00Z',
    date_modified: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps core fields and stringifies ids', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('112')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Classic T-Shirt')
    expect(result.handle).toBe('classic-t-shirt')
    expect(result.description).toBe('<p>A comfortable cotton tee.</p>')
    expect(result.status).toBe('ACTIVE')
    expect(result.productType).toBe('physical')
  })

  it('maps variants with option values', () => {
    const result = transformProduct(makeProduct())
    const variant = result.variants![0]!
    expect(variant.id).toBe('201')
    expect(variant.sku).toBe('TEE-S-RED')
    expect(variant.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(variant.compareAtPrice).toEqual({ amount: 2499, currency: 'USD' })
    expect(variant.optionValues).toEqual({ Size: 'S', Color: 'Red' })
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.bigcommerce.com/img/tee.jpg')
    expect(result.images![0]!.alt).toBe('Front view')
  })

  it('maps options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(2)
    expect(result.options![0]!.name).toBe('Size')
    expect(result.options![0]!.values).toEqual(['S', 'M', 'L'])
  })

  it('maps archived status for disabled products', () => {
    const result = transformProduct(makeProduct({ is_visible: false }))
    expect(result.status).toBe('ARCHIVED')
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

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw.name).toBe('Classic T-Shirt')
    expect(raw.description).toBe('<p>A comfortable cotton tee.</p>')
    expect(raw.is_visible).toBe(true)
  })
})

describe('transformVariant', () => {
  it('builds title from option values when no explicit title', () => {
    const result = transformVariant({
      id: 201,
      product_id: 112,
      sku: 'TEE-S-RED',
      price: 19.99,
      option_values: [
        { option_display_name: 'Size', label: 'S' },
        { option_display_name: 'Color', label: 'Red' },
      ],
    })
    expect(result.title).toBe('S / Red')
  })
})
