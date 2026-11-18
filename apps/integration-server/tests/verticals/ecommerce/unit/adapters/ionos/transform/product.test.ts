import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  type RawIonosProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/ionos/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawIonosProduct> = {}): RawIonosProduct {
  return {
    id: 'prod-42',
    name: 'IONOS Store T-Shirt',
    description: '<p>A quality cotton t-shirt.</p>',
    slug: 'ionos-store-t-shirt',
    status: 'active',
    price: 19.99,
    currency: 'EUR',
    sku: 'TSHIRT-001',
    images: [
      { url: 'https://cdn.ionos.com/tshirt-front.jpg', alt: 'Front view', width: 800, height: 800 },
      { url: 'https://cdn.ionos.com/tshirt-back.jpg', alt: 'Back view', width: 800, height: 800 },
    ],
    tags: ['clothing', 'new-arrival'],
    vendor: 'IONOS Shop',
    productType: 'Apparel',
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-06-15T12:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (IONOS)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('prod-42')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('IONOS Store T-Shirt')
    expect(result.description).toBe('<p>A quality cotton t-shirt.</p>')
    expect(result.handle).toBe('ionos-store-t-shirt')
  })

  it('maps active status correctly', () => {
    const result = transformProduct(makeProduct({ status: 'active' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps published status to ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: 'published' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps draft status correctly', () => {
    const result = transformProduct(makeProduct({ status: 'draft' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps inactive status to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 'inactive' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps archived status correctly', () => {
    const result = transformProduct(makeProduct({ status: 'archived' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps boolean active field when no status string present', () => {
    const result = transformProduct(makeProduct({ status: undefined, active: true }))
    expect(result.status).toBe('ACTIVE')

    const result2 = transformProduct(makeProduct({ status: undefined, active: false }))
    expect(result2.status).toBe('DRAFT')
  })

  it('maps images with position index', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://cdn.ionos.com/tshirt-front.jpg',
      alt: 'Front view',
      width: 800,
      height: 800,
      position: 0,
    })
    expect(result.images![1]!.position).toBe(1)
  })

  it('synthesises a default variant from product price when no variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('prod-42:default')
    expect(v.productId).toBe('prod-42')
    expect(v.price).toEqual({ amount: 1999, currency: 'EUR' })
    expect(v.sku).toBe('TSHIRT-001')
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('uses explicit variants when present', () => {
    const raw = makeProduct({
      variants: [
        { id: 'var-1', price: 19.99, sku: 'TSHIRT-S', options: [{ name: 'Size', value: 'S' }] },
        { id: 'var-2', price: 21.99, sku: 'TSHIRT-L', options: [{ name: 'Size', value: 'L' }] },
      ],
    })
    const result = transformProduct(raw)
    expect(result.variants).toHaveLength(2)
    expect(result.variants![0]!.id).toBe('var-1')
    expect(result.variants![0]!.sku).toBe('TSHIRT-S')
    expect(result.variants![0]!.price).toEqual({ amount: 1999, currency: 'EUR' })
    expect(result.variants![0]!.optionValues).toEqual({ Size: 'S' })
    expect(result.variants![1]!.id).toBe('var-2')
  })

  it('maps tags and vendor/productType', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['clothing', 'new-arrival'])
    expect(result.vendor).toBe('IONOS Shop')
    expect(result.productType).toBe('Apparel')
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-10T08:00:00Z')
    expect(result.updatedAt).toBe('2024-06-15T12:00:00Z')
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

  it('handles product with no images or tags', () => {
    const raw = makeProduct({ images: [], tags: [] })
    const result = transformProduct(raw)
    expect(result.images).toBeUndefined()
    expect(result.tags).toBeUndefined()
  })

  it('handles zero price gracefully', () => {
    const result = transformProduct(makeProduct({ price: 0 }))
    expect(result.variants![0]!.price).toEqual({ amount: 0, currency: 'EUR' })
  })

  it('falls back to "title" field if "name" is absent', () => {
    const raw = makeProduct({ name: undefined, title: 'T-Shirt via title' })
    const result = transformProduct(raw)
    expect(result.title).toBe('T-Shirt via title')
  })

  it('uses "handle" field as slug fallback', () => {
    const raw = makeProduct({ slug: undefined, handle: 'my-handle' })
    const result = transformProduct(raw)
    expect(result.handle).toBe('my-handle')
  })

  it('maps product options when present', () => {
    const raw = makeProduct({
      options: [
        { name: 'Size', values: ['S', 'M', 'L'] },
        { name: 'Color', values: ['Red', 'Blue'] },
      ],
    })
    const result = transformProduct(raw)
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({ name: 'Size', values: ['S', 'M', 'L'], position: 0 })
    expect(result.options![1]).toMatchObject({ name: 'Color', values: ['Red', 'Blue'], position: 1 })
  })

  it('defaults currency to EUR when not specified on product', () => {
    const raw = makeProduct({ currency: undefined })
    const result = transformProduct(raw)
    expect(result.variants![0]!.price.currency).toBe('EUR')
  })
})
