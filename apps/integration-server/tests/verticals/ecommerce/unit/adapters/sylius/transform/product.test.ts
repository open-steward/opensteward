import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawSyliusProduct,
  type RawSyliusVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/sylius/transform/product'
import { ProductSchema, ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawSyliusProduct> = {}): RawSyliusProduct {
  return {
    id: 42,
    code: 'MUG_BLUE',
    name: 'Blue Mug',
    slug: 'blue-mug',
    description: '<p>A beautiful blue ceramic mug.</p>',
    enabled: true,
    variants: [
      makeVariant({ code: 'MUG_BLUE_S', position: 0 }),
      makeVariant({ code: 'MUG_BLUE_L', position: 1, channelPricings: { default: { price: 1299 } } }),
    ],
    options: [
      {
        code: 'mug_size',
        name: 'Size',
        position: 0,
        values: [
          { code: 'small', value: 'Small' },
          { code: 'large', value: 'Large' },
        ],
      },
    ],
    images: [
      { id: 100, type: 'main', path: 'https://cdn.example.com/mug-blue.jpg' },
    ],
    channels: [{ code: 'DEFAULT', name: 'Default' }],
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-02-15T08:30:00Z',
    ...overrides,
  }
}

function makeVariant(overrides: Partial<RawSyliusVariant> = {}): RawSyliusVariant {
  return {
    id: 101,
    code: 'MUG_BLUE_S',
    name: 'Small Blue Mug',
    position: 0,
    tracked: true,
    onHand: 50,
    onHold: 5,
    shippingRequired: true,
    weight: 350,
    channelPricings: {
      default: {
        channelCode: 'DEFAULT',
        price: 999, // $9.99 in cents
        originalPrice: 1499, // $14.99 in cents
      },
    },
    optionValues: [
      { code: 'small', value: 'Small', optionCode: 'mug_size' },
    ],
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-02-15T08:30:00Z',
    ...overrides,
  }
}

describe('transformProduct (Sylius)', () => {
  it('maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('MUG_BLUE')
    expect(result.title).toBe('Blue Mug')
    expect(result.description).toBe('<p>A beautiful blue ceramic mug.</p>')
    expect(result.handle).toBe('blue-mug')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps disabled product to DRAFT status', () => {
    const result = transformProduct(makeProduct({ enabled: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps undefined enabled to undefined status', () => {
    const result = transformProduct(makeProduct({ enabled: undefined }))
    expect(result.status).toBeUndefined()
  })

  it('builds options from product options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]).toMatchObject({
      id: 'mug_size',
      name: 'Size',
      values: ['Small', 'Large'],
    })
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]).toMatchObject({
      id: '100',
      url: 'https://cdn.example.com/mug-blue.jpg',
      alt: 'main',
      position: 0,
    })
  })

  it('maps variants with cents-to-decimal price conversion', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(2)
    expect(result.variants![0]!.id).toBe('MUG_BLUE_S')
    expect(result.variants![0]!.price).toEqual({ amount: 999, currency: 'USD' })
  })

  it('returns undefined variants when product has none', () => {
    const result = transformProduct(makeProduct({ variants: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('preserves the raw payload in metadata unmodified', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('falls back to translations for name', () => {
    const result = transformProduct(
      makeProduct({ name: undefined, translations: { en: { name: 'Translated Mug', slug: 'translated-mug' } } }),
    )
    expect(result.title).toBe('Translated Mug')
  })

  it('falls back to code when name and translations missing', () => {
    const result = transformProduct(makeProduct({ name: undefined }))
    expect(result.title).toBe('MUG_BLUE')
  })

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body['translations']).toEqual({
      en: {
        name: 'Blue Mug',
        slug: 'blue-mug',
        description: '<p>A beautiful blue ceramic mug.</p>',
      },
    })
    expect(body['enabled']).toBe(true)
  })
})

describe('transformProductVariant (Sylius) standalone', () => {
  it('maps core variant fields', () => {
    const v = transformProductVariant(makeVariant(), 'MUG_BLUE')
    expect(v.id).toBe('MUG_BLUE_S')
    expect(v.productId).toBe('MUG_BLUE')
    expect(v.sku).toBe('MUG_BLUE_S')
    expect(v.title).toBe('Small Blue Mug')
    expect(v.price).toEqual({ amount: 999, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 1499, currency: 'USD' })
    expect(v.weight).toBe(350)
    expect(v.weightUnit).toBe('g')
  })

  it('converts price from cents to decimal', () => {
    const v = transformProductVariant(
      makeVariant({ channelPricings: { default: { price: 2500 } } }),
    )
    expect(v.price).toEqual({ amount: 2500, currency: 'USD' })
  })

  it('handles zero price', () => {
    const v = transformProductVariant(
      makeVariant({ channelPricings: { default: { price: 0 } } }),
    )
    expect(v.price).toEqual({ amount: 0, currency: 'USD' })
  })

  it('handles missing channelPricings', () => {
    const v = transformProductVariant(makeVariant({ channelPricings: undefined }))
    expect(v.price).toEqual({ amount: 0, currency: 'USD' })
  })

  it('does not set compareAtPrice when originalPrice is lower than price', () => {
    const v = transformProductVariant(
      makeVariant({ channelPricings: { default: { price: 1500, originalPrice: 1000 } } }),
    )
    expect(v.compareAtPrice).toBeUndefined()
  })

  it('does not set compareAtPrice when originalPrice is null', () => {
    const v = transformProductVariant(
      makeVariant({ channelPricings: { default: { price: 999, originalPrice: null } } }),
    )
    expect(v.compareAtPrice).toBeUndefined()
  })

  it('builds optionValues from variant optionValues', () => {
    const v = transformProductVariant(makeVariant())
    expect(v.optionValues).toEqual({ mug_size: 'Small' })
  })

  it('handles missing optionValues', () => {
    const v = transformProductVariant(makeVariant({ optionValues: undefined }))
    expect(v.optionValues).toBeUndefined()
  })

  it('sets weight undefined when weight is null', () => {
    const v = transformProductVariant(makeVariant({ weight: null }))
    expect(v.weight).toBeUndefined()
    expect(v.weightUnit).toBeUndefined()
  })

  it('marks requiresShipping from shippingRequired', () => {
    const v = transformProductVariant(makeVariant({ shippingRequired: false }))
    expect(v.requiresShipping).toBe(false)
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const v = transformProductVariant(makeVariant(), 'MUG_BLUE')
    expect(() => ProductVariantSchema.parse(v)).not.toThrow()
  })

  it('round-trips writable fields via untransformProductVariant', () => {
    const canonical = transformProductVariant(makeVariant(), 'MUG_BLUE')
    const body = untransformProductVariant(canonical)
    expect(body['code']).toBe('MUG_BLUE_S')
    expect((body['channelPricings'] as Record<string, Record<string, unknown>>)['default']['price']).toBe(999)
  })

  it('converts decimal price back to cents in untransform', () => {
    const body = untransformProductVariant({ price: { amount: 1999, currency: 'USD' } })
    expect((body['channelPricings'] as Record<string, Record<string, unknown>>)['default']['price']).toBe(1999)
  })

  it('handles array-style channelPricings', () => {
    const v = transformProductVariant(
      makeVariant({ channelPricings: [{ channelCode: 'WEB', price: 1200 }] }),
    )
    expect(v.price).toEqual({ amount: 1200, currency: 'USD' })
  })

  it('falls back to translations for name', () => {
    const v = transformProductVariant(
      makeVariant({ name: null, translations: { en: { name: 'Translated Variant' } } }),
    )
    expect(v.title).toBe('Translated Variant')
  })
})
