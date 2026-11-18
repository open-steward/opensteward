import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapPublishedToStatus,
  type RawGumroadProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/gumroad/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawGumroadProduct> = {}): RawGumroadProduct {
  return {
    id: 'abc123',
    name: 'Ultimate Guide to TypeScript',
    description: 'A comprehensive ebook on TypeScript.',
    published: true,
    url: 'https://gumroad.com/l/abc123',
    short_url: 'https://gum.co/abc123',
    price: 1999, // $19.99
    currency: 'usd',
    tags: ['typescript', 'ebook', 'programming'],
    thumbnail_url: 'https://public-files.gumroad.com/abc123/thumb.jpg',
    preview_url: 'https://public-files.gumroad.com/abc123/preview.jpg',
    custom_permalink: 'typescript-guide',
    sales_count: 150,
    sales_usd_cents: 299850,
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-06-20T14:00:00Z',
    ...overrides,
  }
}

describe('transformProduct (Gumroad)', () => {
  it('uses the product id as the canonical id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('abc123')
    expect(result.title).toBe('Ultimate Guide to TypeScript')
    expect(result.description).toBe('A comprehensive ebook on TypeScript.')
  })

  it('maps published boolean to canonical status', () => {
    expect(transformProduct(makeProduct({ published: true })).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ published: false })).status).toBe('DRAFT')
    expect(transformProduct(makeProduct({ published: undefined })).status).toBeUndefined()
  })

  it('maps thumbnail and preview as images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://public-files.gumroad.com/abc123/thumb.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://public-files.gumroad.com/abc123/preview.jpg',
      position: 1,
    })
  })

  it('deduplicates images when thumbnail equals preview', () => {
    const sameUrl = 'https://public-files.gumroad.com/abc123/thumb.jpg'
    const result = transformProduct(makeProduct({
      thumbnail_url: sameUrl,
      preview_url: sameUrl,
    }))
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe(sameUrl)
  })

  it('handles missing images gracefully', () => {
    const result = transformProduct(makeProduct({
      thumbnail_url: null,
      preview_url: null,
    }))
    expect(result.images).toBeUndefined()
  })

  it('maps tags correctly', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['typescript', 'ebook', 'programming'])
  })

  it('uses custom_permalink as handle when available', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('typescript-guide')
  })

  it('falls back to short_url when custom_permalink is null', () => {
    const result = transformProduct(makeProduct({ custom_permalink: null }))
    expect(result.handle).toBe('https://gum.co/abc123')
  })

  it('maps timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-15T10:30:00Z')
    expect(result.updatedAt).toBe('2024-06-20T14:00:00Z')
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['id']).toBe('abc123')
    expect(result.metadata['price']).toBe(1999)
  })

  it('round-trips title and tags via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body['name']).toBe('Ultimate Guide to TypeScript')
    expect(body['tags']).toEqual(['typescript', 'ebook', 'programming'])
    expect(body['description']).toBe('A comprehensive ebook on TypeScript.')
  })

  it('untransformProduct maps ACTIVE status to published=true', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body['published']).toBe(true)
  })

  it('untransformProduct maps DRAFT status to published=false', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body['published']).toBe(false)
  })

  it('untransformProduct passes through metadata fields', () => {
    const body = untransformProduct({
      title: 'Test',
      metadata: { price: 999, currency: 'eur', custom_permalink: 'my-product' },
    })
    expect(body['price']).toBe(999)
    expect(body['currency']).toBe('eur')
    expect(body['custom_permalink']).toBe('my-product')
  })
})

describe('mapPublishedToStatus', () => {
  it('maps all known states correctly', () => {
    expect(mapPublishedToStatus(true)).toBe('ACTIVE')
    expect(mapPublishedToStatus(false)).toBe('DRAFT')
    expect(mapPublishedToStatus(undefined)).toBeUndefined()
  })
})
