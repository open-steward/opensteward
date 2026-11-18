import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWooCommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/xt-commerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(
  overrides: Partial<RawWooCommerceCategory> = {},
): RawWooCommerceCategory {
  return {
    id: 7,
    name: 'Electronics',
    slug: 'electronics',
    parent: 0,
    description: 'Electronic devices and accessories.',
    image: {
      id: 55,
      src: 'https://cdn.example.com/img/electronics.jpg',
      alt: 'Electronics category',
    },
    count: 24,
    ...overrides,
  }
}

describe('transformCollection (xt-commerce)', () => {
  it('maps id to string and title', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('7')
    expect(result.title).toBe('Electronics')
  })

  it('maps slug to handle', () => {
    const result = transformCollection(makeCategory())
    expect(result.handle).toBe('electronics')
  })

  it('maps description', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('Electronic devices and accessories.')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('always sets productIds to empty array', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual([])
  })

  it('maps image src to image url', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.example.com/img/electronics.jpg')
    expect(result.image?.alt).toBe('Electronics category')
    expect(result.image?.id).toBe('55')
  })

  it('returns undefined image when image has no src', () => {
    const result = transformCollection(makeCategory({ image: { id: 1 } }))
    expect(result.image).toBeUndefined()
  })

  it('returns undefined image when image is null', () => {
    const result = transformCollection(makeCategory({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (xt-commerce)', () => {
  it('maps title to name', () => {
    const body = untransformCollection({ title: 'New Category' })
    expect(body['name']).toBe('New Category')
  })

  it('maps handle to slug', () => {
    const body = untransformCollection({ handle: 'new-category' })
    expect(body['slug']).toBe('new-category')
  })

  it('maps description', () => {
    const body = untransformCollection({ description: 'A new category' })
    expect(body['description']).toBe('A new category')
  })

  it('maps image url to image.src', () => {
    const body = untransformCollection({
      image: { url: 'https://example.com/img.jpg', alt: 'img' },
    })
    expect((body['image'] as { src: string })['src']).toBe('https://example.com/img.jpg')
  })
})
