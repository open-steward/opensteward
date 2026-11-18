import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawWooCommerceProduct,
  type RawWooCommerceVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/yampi/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawWooCommerceProduct> = {}): RawWooCommerceProduct {
  return {
    id: 42,
    name: 'Test T-Shirt',
    slug: 'test-t-shirt',
    status: 'publish',
    type: 'simple',
    price: '29.99',
    regular_price: '29.99',
    date_created_gmt: '2024-01-01T00:00:00Z',
    date_modified_gmt: '2024-01-02T00:00:00Z',
    ...overrides,
  }
}

function makeVariation(overrides: Partial<RawWooCommerceVariation> = {}): RawWooCommerceVariation {
  return {
    id: 99,
    sku: 'TSH-RED-M',
    price: '29.99',
    regular_price: '29.99',
    status: 'publish',
    attributes: [{ name: 'Color', option: 'Red' }],
    ...overrides,
  }
}

describe('transformProduct (Yampi/WooCommerce)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('42')
    expect(result.title).toBe('Test T-Shirt')
    expect(result.handle).toBe('test-t-shirt')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps publish → ACTIVE, draft → DRAFT, trash → ARCHIVED', () => {
    expect(transformProduct(makeProduct({ status: 'publish' })).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ status: 'draft' })).status).toBe('DRAFT')
    expect(transformProduct(makeProduct({ status: 'trash' })).status).toBe('ARCHIVED')
  })

  it('synthesizes a single default variant for simple products', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('42:default')
    expect(result.variants![0]!.price).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps categories to productType', () => {
    const result = transformProduct(
      makeProduct({ categories: [{ id: 1, name: 'Clothing', slug: 'clothing' }] }),
    )
    expect(result.productType).toBe('Clothing')
  })

  it('maps tags', () => {
    const result = transformProduct(
      makeProduct({ tags: [{ id: 1, name: 'summer', slug: 'summer' }] }),
    )
    expect(result.tags).toEqual(['summer'])
  })

  it('maps images', () => {
    const result = transformProduct(
      makeProduct({ images: [{ id: 5, src: 'https://example.com/img.jpg', alt: 'front' }] }),
    )
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://example.com/img.jpg')
    expect(result.images![0]!.alt).toBe('front')
  })

  it('maps options from attributes with options array', () => {
    const result = transformProduct(
      makeProduct({
        type: 'variable',
        attributes: [{ name: 'Size', options: ['S', 'M', 'L'], variation: true }],
      }),
    )
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('Size')
    expect(result.options![0]!.values).toEqual(['S', 'M', 'L'])
  })

  it('maps full variation objects when passed', () => {
    const result = transformProduct(
      makeProduct({
        type: 'variable',
        variations: [makeVariation()],
      }),
    )
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('42:99')
    expect(result.variants![0]!.sku).toBe('TSH-RED-M')
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-01-02T00:00:00Z')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeProduct()))).not.toThrow()
  })
})

describe('transformProductVariant (Yampi/WooCommerce)', () => {
  it('builds composite id from productId:variationId', () => {
    const result = transformProductVariant(makeVariation(), '42')
    expect(result.id).toBe('42:99')
    expect(result.productId).toBe('42')
  })

  it('converts price from major to minor units', () => {
    const result = transformProductVariant(makeVariation({ price: '19.99' }), '42')
    expect(result.price).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('maps option values from variation attributes', () => {
    const result = transformProductVariant(
      makeVariation({ attributes: [{ name: 'Color', option: 'Red' }] }),
      '42',
    )
    expect(result.optionValues).toEqual({ Color: 'Red' })
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    expect(() =>
      ProductVariantSchema.parse(transformProductVariant(makeVariation(), '42')),
    ).not.toThrow()
  })
})

describe('untransformProduct (Yampi/WooCommerce)', () => {
  it('maps title and handle back to WC fields', () => {
    const result = untransformProduct({
      title: 'Test T-Shirt',
      handle: 'test-t-shirt',
      status: 'ACTIVE',
    })
    expect(result.name).toBe('Test T-Shirt')
    expect(result.slug).toBe('test-t-shirt')
    expect(result.status).toBe('publish')
  })

  it('maps DRAFT status to draft', () => {
    const result = untransformProduct({ status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })
})

describe('untransformProductVariant (Yampi/WooCommerce)', () => {
  it('maps sku and price back to WC fields', () => {
    const result = untransformProductVariant({
      sku: 'SKU-123',
      price: { amount: 2999, currency: 'USD' },
    })
    expect(result.sku).toBe('SKU-123')
    expect(result.regular_price).toBe('29.99')
  })

  it('maps optionValues back to WC attributes array', () => {
    const result = untransformProductVariant({
      optionValues: { Color: 'Blue', Size: 'M' },
    })
    const attrs = result.attributes as Array<{ name: string; option: string }>
    expect(attrs).toHaveLength(2)
    expect(attrs.find((a) => a.name === 'Color')?.option).toBe('Blue')
  })
})
