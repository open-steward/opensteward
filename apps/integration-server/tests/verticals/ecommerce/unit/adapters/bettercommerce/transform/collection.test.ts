import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawBCCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/bettercommerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawBCCategory> = {}): RawBCCategory {
  return {
    recordId: 'cat-001',
    name: 'Mens Footwear',
    slug: 'mens-footwear',
    description: 'Shoes and boots for men',
    image: 'https://cdn.example.com/mens-footwear.jpg',
    imageAlt: 'Mens Footwear',
    isActive: true,
    updatedAt: '2024-03-01T00:00:00Z',
    publishedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (BetterCommerce)', () => {
  it('maps recordId to id', () => {
    const result = transformCollection(makeCategory({ recordId: 'cat-001' }))
    expect(result.id).toBe('cat-001')
  })

  it('falls back to categoryId when recordId is absent', () => {
    const result = transformCollection(makeCategory({ recordId: undefined, categoryId: 'cat-abc' }))
    expect(result.id).toBe('cat-abc')
  })

  it('maps name to title', () => {
    const result = transformCollection(makeCategory())
    expect(result.title).toBe('Mens Footwear')
  })

  it('maps slug to handle', () => {
    const result = transformCollection(makeCategory())
    expect(result.handle).toBe('mens-footwear')
  })

  it('maps description', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('Shoes and boots for men')
  })

  it('hardcodes type to MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('maps image url', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.example.com/mens-footwear.jpg')
  })

  it('maps imageAlt to image.alt', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.alt).toBe('Mens Footwear')
  })

  it('returns undefined image when image is absent', () => {
    const result = transformCollection(makeCategory({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('maps updatedAt', () => {
    const result = transformCollection(makeCategory())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('maps publishedAt', () => {
    const result = transformCollection(makeCategory())
    expect(result.publishedAt).toBe('2024-01-01T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (BetterCommerce)', () => {
  it('maps title to name', () => {
    const body = untransformCollection({ title: 'New Category' })
    expect(body.name).toBe('New Category')
  })

  it('maps handle to slug', () => {
    const body = untransformCollection({ handle: 'new-cat' })
    expect(body.slug).toBe('new-cat')
  })

  it('maps image url', () => {
    const body = untransformCollection({ image: { url: 'https://x.com/img.jpg', alt: 'img' } })
    expect(body.image).toBe('https://x.com/img.jpg')
    expect(body.imageAlt).toBe('img')
  })
})
