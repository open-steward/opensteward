import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type RawWooCommerceProduct,
  type RawWooCommerceVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/gambio/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariation(overrides: Partial<RawWooCommerceVariation> = {}): RawWooCommerceVariation {
  return {
    id: 1111,
    sku: 'SHIRT-R-M',
    price: '29.99',
    regular_price: '39.99',
    sale_price: '29.99',
    weight: '0.3',
    attributes: [
      { name: 'Color', option: 'Red' },
      { name: 'Size', option: 'M' },
    ],
    menu_order: 1,
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawWooCommerceProduct> = {}): RawWooCommerceProduct {
  return {
    id: 500,
    name: 'Classic Shirt',
    slug: 'classic-shirt',
    description: '<p>A timeless shirt.</p>',
    type: 'variable',
    status: 'publish',
    categories: [{ id: 10, name: 'Tops' }],
    tags: [{ name: 'shirt' }, { name: 'classic' }],
    attributes: [
      { name: 'Color', options: ['Red', 'Blue'], variation: true },
      { name: 'Size', options: ['S', 'M', 'L'], variation: true },
    ],
    variations: [makeVariation()],
    images: [
      {
        id: 777,
        src: 'https://cdn.example.com/shirt.jpg',
        alt: 'Classic Shirt',
        position: 0,
      },
    ],
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-03-10T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (Gambio / WooCommerce)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('500')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Classic Shirt')
    expect(result.handle).toBe('classic-shirt')
    expect(result.description).toBe('<p>A timeless shirt.</p>')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps WP status strings to ProductStatus enum', () => {
    expect(transformProduct(makeProduct({ status: 'publish' })).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ status: 'draft' })).status).toBe('DRAFT')
    expect(transformProduct(makeProduct({ status: 'private' })).status).toBe('ARCHIVED')
  })

  it('maps productType from first category name', () => {
    const result = transformProduct(makeProduct())
    expect(result.productType).toBe('Tops')
  })

  it('maps tags from tag objects', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['shirt', 'classic'])
  })

  it('maps variation as variant with compound id', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('500:1111')
    expect(v.productId).toBe('500')
    // price is the effective price (sale_price or price)
    expect(v.price).toEqual({ amount: 2999, currency: 'USD' })
    // compare at price from regular_price when sale is active
    expect(v.compareAtPrice).toEqual({ amount: 3999, currency: 'USD' })
    expect(v.sku).toBe('SHIRT-R-M')
    // weight defaults to 'g' (WC doesn't expose weight unit)
    expect(v.weightUnit).toBe('g')
    expect(v.optionValues).toEqual({ Color: 'Red', Size: 'M' })
  })

  it('synthesises single default variant for simple products', () => {
    const result = transformProduct(
      makeProduct({ type: 'simple', variations: [], price: '19.99', status: 'publish' }),
    )
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('500:default')
    expect(result.variants![0]!.price).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/shirt.jpg')
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
    const back = untransformProduct(canonical)
    expect(back.name).toBe('Classic Shirt')
    expect(back.status).toBe('publish')
  })
})

describe('transformProductVariant (Gambio / WooCommerce)', () => {
  it('builds standalone variant with compound id', () => {
    const result = transformProductVariant(makeVariation(), '500')
    expect(result.id).toBe('500:1111')
    expect(result.productId).toBe('500')
    expect(result.sku).toBe('SHIRT-R-M')
  })
})
