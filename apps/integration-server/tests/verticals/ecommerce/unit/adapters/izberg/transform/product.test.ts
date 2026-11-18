import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawIzbergProductOffer,
  type RawIzbergProductVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/izberg/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariation(
  overrides: Partial<RawIzbergProductVariation> = {},
): RawIzbergProductVariation {
  return {
    id: 201,
    name: 'Red / L',
    price: '29.99',
    stock: 10,
    sku: 'SHIRT-RED-L',
    is_default: true,
    weight: 0.5,
    ...overrides,
  }
}

function makeOffer(overrides: Partial<RawIzbergProductOffer> = {}): RawIzbergProductOffer {
  return {
    id: 501,
    name: 'Classic Shirt',
    description: 'A classic cotton shirt.',
    price: '29.99',
    currency: 'EUR',
    status: 10, // ACTIVE
    slug: 'classic-shirt',
    tags: ['fashion', 'casual'],
    vendor: 'FashionCo',
    default_image_url: 'https://cdn.izberg.com/offers/shirt.jpg',
    images: [{ id: 1, url: 'https://cdn.izberg.com/offers/shirt-detail.jpg', order: 1 }],
    variations: [makeVariation()],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformVariant (izberg)', () => {
  it('maps id as string and productId', () => {
    const result = transformVariant(makeVariation(), '501', 'EUR')
    expect(result.id).toBe('201')
    expect(result.productId).toBe('501')
  })

  it('maps sku and title', () => {
    const result = transformVariant(makeVariation(), '501', 'EUR')
    expect(result.sku).toBe('SHIRT-RED-L')
    expect(result.title).toBe('Red / L')
  })

  it('maps price in minor units', () => {
    const result = transformVariant(makeVariation(), '501', 'EUR')
    // 29.99 EUR → 2999 minor units
    expect(result.price).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('maps weight', () => {
    const result = transformVariant(makeVariation(), '501', 'EUR')
    expect(result.weight).toBe(0.5)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariation()
    const result = transformVariant(raw, '501', 'EUR')
    expect(result.metadata).toBe(raw)
  })
})

describe('transformProduct (izberg)', () => {
  it('maps id as string and title', () => {
    const result = transformProduct(makeOffer())
    expect(result.id).toBe('501')
    expect(result.title).toBe('Classic Shirt')
  })

  it('maps description', () => {
    const result = transformProduct(makeOffer())
    expect(result.description).toBe('A classic cotton shirt.')
  })

  it('maps handle from slug', () => {
    const result = transformProduct(makeOffer())
    expect(result.handle).toBe('classic-shirt')
  })

  it('maps status from numeric code: 10 → ACTIVE', () => {
    const result = transformProduct(makeOffer())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status 90 → DRAFT', () => {
    const result = transformProduct(makeOffer({ status: 90 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status 0 → ARCHIVED', () => {
    const result = transformProduct(makeOffer({ status: 0 }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps vendor', () => {
    const result = transformProduct(makeOffer())
    expect(result.vendor).toBe('FashionCo')
  })

  it('maps tags', () => {
    const result = transformProduct(makeOffer())
    expect(result.tags).toEqual(['fashion', 'casual'])
  })

  it('maps images: default_image_url first, then images array', () => {
    const result = transformProduct(makeOffer())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toBe('https://cdn.izberg.com/offers/shirt.jpg')
    expect(result.images![0]!.position).toBe(0)
    expect(result.images![1]!.url).toBe('https://cdn.izberg.com/offers/shirt-detail.jpg')
  })

  it('maps variants', () => {
    const result = transformProduct(makeOffer())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('201')
    expect(result.variants![0]!.sku).toBe('SHIRT-RED-L')
  })

  it('synthesises a default variant when no variations exist', () => {
    const result = transformProduct(makeOffer({ variations: [] }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('501:default')
    // 29.99 EUR → 2999 minor units
    expect(result.variants![0]!.price).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('maps createdAt and updatedAt via toIsoDatetime', () => {
    // toIsoDatetime normalises to full ISO 8601 with milliseconds via Date.toISOString()
    const result = transformProduct(makeOffer())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeOffer()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const canonical = transformProduct(makeOffer())
    const body = untransformProduct(canonical)
    expect(body['name']).toBe('Classic Shirt')
    expect(body['status']).toBe(10) // ACTIVE
    expect(body['slug']).toBe('classic-shirt')
    // price: 2999 minor units → '29.99' major EUR
    expect(body['price']).toBe('29.99')
  })
})
