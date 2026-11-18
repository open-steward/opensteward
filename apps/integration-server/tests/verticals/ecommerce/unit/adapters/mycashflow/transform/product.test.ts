import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawMyCashflowProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/mycashflow/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRaw(overrides: Partial<RawMyCashflowProduct> = {}): RawMyCashflowProduct {
  return {
    id: 99,
    name: 'Widget Pro',
    description: 'A great widget',
    slug: 'widget-pro',
    code: 'WP-001',
    price: 29.99,
    status: 'active',
    images: [{ id: 1, url: 'https://example.com/widget.jpg', alt: 'Widget', position: 0 }],
    variations: [
      {
        id: 200,
        product_id: 99,
        name: 'Blue',
        code: 'WP-001-BLU',
        price: 29.99,
        features: [{ name: 'Color', value: 'Blue' }],
      },
    ],
    categories: [{ id: 10, name: 'Electronics' }],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-10T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (MyCashflow)', () => {
  it('maps id to string canonical id', () => {
    const result = transformProduct(makeRaw())
    expect(result.id).toBe('99')
  })

  it('maps name to title', () => {
    const result = transformProduct(makeRaw())
    expect(result.title).toBe('Widget Pro')
  })

  it('maps status=active to ACTIVE', () => {
    const result = transformProduct(makeRaw())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status=hidden to DRAFT', () => {
    const result = transformProduct(makeRaw({ status: 'hidden' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps published=true to ACTIVE', () => {
    const result = transformProduct(makeRaw({ status: null, published: true }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps variations to variants with price conversion', () => {
    const result = transformProduct(makeRaw())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('200')
    // EUR 2 decimal digits → 29.99 × 100 = 2999
    expect(v.price).toEqual({ amount: 2999, currency: 'EUR' })
    expect(v.sku).toBe('WP-001-BLU')
    expect(v.optionValues).toEqual({ Color: 'Blue' })
  })

  it('synthesises a default variant when no variations present', () => {
    const result = transformProduct(makeRaw({ variations: [] }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('99:default')
    expect(result.variants![0]!.sku).toBe('WP-001')
  })

  it('maps images array', () => {
    const result = transformProduct(makeRaw())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://example.com/widget.jpg')
  })

  it('maps first category name to productType', () => {
    const result = transformProduct(makeRaw())
    expect(result.productType).toBe('Electronics')
  })

  it('maps slug to handle', () => {
    const result = transformProduct(makeRaw())
    expect(result.handle).toBe('widget-pro')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformProduct(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-10T00:00:00Z')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeRaw())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformProduct (MyCashflow)', () => {
  it('round-trips title, description, slug', () => {
    const raw = makeRaw()
    const product = transformProduct(raw)
    const body = untransformProduct(product)
    expect(body['name']).toBe('Widget Pro')
    expect(body['description']).toBe('A great widget')
    expect(body['slug']).toBe('widget-pro')
  })

  it('sets published=true for ACTIVE status', () => {
    const product = transformProduct(makeRaw())
    const body = untransformProduct(product)
    expect(body['published']).toBe(true)
  })
})
