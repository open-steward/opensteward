import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawShoplazzaProduct,
  type RawShoplazzaVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoplazza/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRawProduct(overrides: Partial<RawShoplazzaProduct> = {}): RawShoplazzaProduct {
  return {
    id: 60001,
    title: 'Bamboo Desk Organizer',
    // Shoplazza uses description not body_html
    description: '<p>Eco-friendly bamboo organizer</p>',
    handle: 'bamboo-desk-organizer',
    // Shoplazza uses published boolean for status
    published: true,
    published_at: '2024-03-01T00:00:00.000Z',
    vendor: 'EcoHome',
    tags: 'eco,home-office',
    options: [{ id: 1, name: 'Color', position: 1, values: ['Natural', 'Dark'] }],
    variants: [
      {
        id: 70001,
        product_id: 60001,
        title: 'Natural',
        sku: 'BDO-NAT',
        price: '34.99',
        // Shoplazza: compare_at_price '0' should be excluded
        compare_at_price: '0',
        position: 1,
        option1: 'Natural',
        taxable: true,
        requires_shipping: true,
      },
    ],
    images: [
      {
        id: 80001,
        src: 'https://cdn.shoplazza.com/bamboo.jpg',
        alt: 'Bamboo Organizer',
        position: 1,
      },
    ],
    created_at: '2024-02-20T00:00:00.000Z',
    updated_at: '2024-04-01T08:00:00.000Z',
    ...overrides,
  }
}

function makeRawVariant(overrides: Partial<RawShoplazzaVariant> = {}): RawShoplazzaVariant {
  return {
    id: 70002,
    product_id: 60001,
    title: 'Dark',
    sku: 'BDO-DRK',
    price: '34.99',
    compare_at_price: '39.99',
    position: 2,
    option1: 'Dark',
    weight: 0.5,
    weight_unit: 'kg',
    taxable: true,
    requires_shipping: true,
    ...overrides,
  }
}

describe('shoplazza transformProduct', () => {
  it('maps id to string and title', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.id).toBe('60001')
    expect(result.title).toBe('Bamboo Desk Organizer')
  })

  it('maps published=true to ACTIVE status', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps published=false to DRAFT status', () => {
    const result = transformProduct(makeRawProduct({ published: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps description field (not body_html)', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.description).toBe('<p>Eco-friendly bamboo organizer</p>')
  })

  it('falls back to brief when description is absent', () => {
    const result = transformProduct(makeRawProduct({ description: null, brief: 'Eco organizer' }))
    expect(result.description).toBe('Eco organizer')
  })

  it('parses comma-separated string tags', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.tags).toEqual(['eco', 'home-office'])
  })

  it('accepts array tags', () => {
    const result = transformProduct(makeRawProduct({ tags: ['eco', 'home-office'] }))
    expect(result.tags).toEqual(['eco', 'home-office'])
  })

  it('excludes compare_at_price of "0" (Shoplazza quirk)', () => {
    const result = transformProduct(makeRawProduct())
    // variant has compare_at_price: '0' which should be excluded
    expect(result.variants![0].compareAtPrice).toBeUndefined()
  })

  it('maps option values for variant via positional option1', () => {
    const result = transformProduct(makeRawProduct())
    expect(result.variants![0].optionValues).toEqual({ Color: 'Natural' })
  })

  it('produces output that passes ProductSchema', () => {
    const result = transformProduct(makeRawProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const canonical = transformProduct(makeRawProduct())
    const back = untransformProduct(canonical)
    expect(back.title).toBe('Bamboo Desk Organizer')
    expect(back.published).toBe(true)
    // tags joined with ',' (no space in Shoplazza)
    expect(back.tags).toBe('eco,home-office')
  })
})

describe('shoplazza transformVariant', () => {
  it('maps id and productId to strings', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.id).toBe('70002')
    expect(result.productId).toBe('60001')
  })

  it('converts price to minor units (USD: ×100)', () => {
    // 34.99 USD = 3499 cents
    const result = transformVariant(makeRawVariant())
    expect(result.price.amount).toBe(3499)
    expect(result.price.currency).toBe('USD')
  })

  it('maps compareAtPrice to minor units when non-zero', () => {
    // 39.99 USD = 3999 cents
    const result = transformVariant(makeRawVariant())
    expect(result.compareAtPrice?.amount).toBe(3999)
  })

  it('excludes compare_at_price of 0 (Shoplazza quirk)', () => {
    const result = transformVariant(makeRawVariant({ compare_at_price: 0 }))
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('maps weight and weightUnit', () => {
    const result = transformVariant(makeRawVariant())
    expect(result.weight).toBe(0.5)
    expect(result.weightUnit).toBe('kg')
  })

  it('produces output that passes ProductVariantSchema', () => {
    const result = transformVariant(makeRawVariant())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformVariant (price serialized with .toFixed(2))', () => {
    const canonical = transformVariant(makeRawVariant())
    const back = untransformVariant(canonical)
    expect(back.sku).toBe('BDO-DRK')
    // untransformVariant uses minorToMajor(...).toFixed(2)
    expect(back.price).toBe('34.99')
  })
})
