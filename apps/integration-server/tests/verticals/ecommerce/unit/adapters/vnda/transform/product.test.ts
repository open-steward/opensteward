import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawWooCommerceProduct,
  type RawWooCommerceVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/vnda/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariation(overrides: Partial<RawWooCommerceVariation> = {}): RawWooCommerceVariation {
  return {
    id: 500,
    sku: 'TSHIRT-SM',
    price: '19.99',
    regular_price: '24.99',
    sale_price: '19.99',
    weight: '0.3',
    attributes: [{ name: 'Size', option: 'Small' }],
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawWooCommerceProduct> = {}): RawWooCommerceProduct {
  return {
    id: 100,
    name: 'Wireless Keyboard',
    slug: 'wireless-keyboard',
    status: 'publish',
    description: '<p>A great keyboard.</p>',
    type: 'variable',
    tags: [{ name: 'accessories' }],
    categories: [{ name: 'Electronics' }],
    images: [{ id: 1, src: 'https://example.com/img.jpg', alt: 'Keyboard' }],
    attributes: [{ name: 'Size', position: 0, variation: true, options: ['Small', 'Medium'] }],
    variations: [makeVariation()],
    date_created_gmt: '2026-01-15T09:30:00.000Z',
    date_modified_gmt: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformProductVariant (VNDA/WooCommerce)', () => {
  it('synthesizes id as productId:variantId', () => {
    const result = transformProductVariant(makeVariation(), '100', 'USD')
    expect(result.id).toBe('100:500')
    expect(result.productId).toBe('100')
  })

  it('converts price from major-unit string to minor units', () => {
    const result = transformProductVariant(makeVariation(), '100', 'USD')
    expect(result.price).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('maps compareAtPrice from regular_price when sale is active', () => {
    const result = transformProductVariant(makeVariation(), '100', 'USD')
    expect(result.compareAtPrice).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('maps optionValues from attributes', () => {
    const result = transformProductVariant(makeVariation(), '100', 'USD')
    expect(result.optionValues).toEqual({ Size: 'Small' })
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    const result = transformProductVariant(makeVariation(), '100', 'USD')
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('round-trips sku via untransformProductVariant', () => {
    const variant = transformProductVariant(makeVariation(), '100', 'USD')
    const body = untransformProductVariant(variant)
    expect(body['sku']).toBe('TSHIRT-SM')
  })
})

describe('transformProduct (VNDA/WooCommerce)', () => {
  it('maps id, title, handle', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('100')
    expect(result.title).toBe('Wireless Keyboard')
    expect(result.handle).toBe('wireless-keyboard')
  })

  it('maps status=publish to ACTIVE', () => {
    expect(transformProduct(makeProduct({ status: 'publish' })).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ status: 'draft' })).status).toBe('DRAFT')
    expect(transformProduct(makeProduct({ status: 'private' })).status).toBe('ARCHIVED')
  })

  it('maps tags and productType from first category', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['accessories'])
    expect(result.productType).toBe('Electronics')
  })

  it('maps variants from variation objects', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('100:500')
  })

  it('synthesizes a default variant for simple products', () => {
    const result = transformProduct(makeProduct({ type: 'simple', variations: [], price: '9.99' }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('100:default')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://example.com/img.jpg')
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2026-01-15T09:30:00.000Z')
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips status via untransformProduct', () => {
    const product = transformProduct(makeProduct())
    const body = untransformProduct(product)
    expect(body['status']).toBe('publish')
    expect(body['name']).toBe('Wireless Keyboard')
  })
})
