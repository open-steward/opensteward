import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type RawWooCommerceProduct,
  type RawWooCommerceVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/fnac-marketplace/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariation(overrides: Partial<RawWooCommerceVariation> = {}): RawWooCommerceVariation {
  return {
    id: 201,
    sku: 'DVD-RED',
    price: '19.99',
    regular_price: '24.99',
    sale_price: '19.99',
    status: 'publish',
    attributes: [{ name: 'Color', option: 'Red' }],
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawWooCommerceProduct> = {}): RawWooCommerceProduct {
  return {
    id: 101,
    name: 'Action DVD',
    slug: 'action-dvd',
    type: 'variable',
    status: 'publish',
    description: 'A great action movie on DVD',
    sku: 'DVD-001',
    price: '19.99',
    regular_price: '24.99',
    categories: [{ name: 'Movies', slug: 'movies' }],
    tags: [
      { name: 'action', slug: 'action' },
      { name: 'dvd', slug: 'dvd' },
    ],
    images: [{ id: 301, src: 'https://cdn.example.com/dvd.jpg', position: 0 }],
    attributes: [{ name: 'Color', position: 0, variation: true, options: ['Red', 'Blue'] }],
    variations: [makeVariation()],
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformProductVariant (FNAC/WooCommerce)', () => {
  it('maps composite id from productId:variantId', () => {
    const result = transformProductVariant(makeVariation(), '101')
    expect(result.id).toBe('101:201')
    expect(result.productId).toBe('101')
  })

  it('maps sku', () => {
    const result = transformProductVariant(makeVariation(), '101')
    expect(result.sku).toBe('DVD-RED')
  })

  it('maps price from major to minor units', () => {
    const result = transformProductVariant(makeVariation({ price: '19.99' }), '101', 'EUR')
    expect(result.price).toEqual({ amount: 1999, currency: 'EUR' })
  })

  it('maps optionValues from attributes', () => {
    const result = transformProductVariant(makeVariation(), '101')
    expect(result.optionValues).toEqual({ Color: 'Red' })
  })
})

describe('transformProduct (FNAC/WooCommerce)', () => {
  it('maps id and title', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('101')
    expect(result.title).toBe('Action DVD')
  })

  it('maps handle from slug', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('action-dvd')
  })

  it('maps status publish → ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: 'publish' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status draft → DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps productType from first category', () => {
    const result = transformProduct(makeProduct())
    expect(result.productType).toBe('Movies')
  })

  it('maps tags array', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['action', 'dvd'])
  })

  it('maps variants from variations', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('101:201')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/dvd.jpg')
  })

  it('synthesises a default variant for simple products', () => {
    const result = transformProduct(makeProduct({ type: 'simple', variations: [] }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('101:default')
  })

  it('maps description', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('A great action movie on DVD')
  })

  it('round-trips via untransformProduct', () => {
    const result = transformProduct(makeProduct())
    const body = untransformProduct(result)
    expect(body.name).toBe('Action DVD')
    expect(body.slug).toBe('action-dvd')
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
