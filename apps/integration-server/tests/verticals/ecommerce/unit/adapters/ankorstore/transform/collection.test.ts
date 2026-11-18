import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWooCommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/ankorstore/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawWooCommerceCategory> = {}): RawWooCommerceCategory {
  return {
    id: 42,
    name: 'Summer Collection',
    slug: 'summer-collection',
    description: 'Hot summer picks',
    image: { id: 7, src: 'https://example.com/summer.jpg', alt: 'Summer banner', name: null },
    ...overrides,
  }
}

describe('transformCollection (Ankorstore / WooCommerce)', () => {
  it('maps id to string', () => {
    const result = transformCollection(makeCategory({ id: 99 }))
    expect(result.id).toBe('99')
  })

  it('maps name to title', () => {
    const result = transformCollection(makeCategory())
    expect(result.title).toBe('Summer Collection')
  })

  it('maps slug to handle', () => {
    const result = transformCollection(makeCategory())
    expect(result.handle).toBe('summer-collection')
  })

  it('hardcodes type as MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('maps description', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('Hot summer picks')
  })

  it('emits empty productIds array', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual([])
  })

  it('maps image src to image.url', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://example.com/summer.jpg')
  })

  it('maps image alt', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.alt).toBe('Summer banner')
  })

  it('falls back to image name when alt is null', () => {
    const result = transformCollection(
      makeCategory({
        image: { src: 'https://example.com/img.jpg', name: 'Hero Image', alt: null },
      }),
    )
    expect(result.image?.alt).toBe('Hero Image')
  })

  it('returns undefined image when image is null', () => {
    const result = transformCollection(makeCategory({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('returns undefined image when src is missing', () => {
    const result = transformCollection(makeCategory({ image: { src: undefined } }))
    expect(result.image).toBeUndefined()
  })

  it('stores raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (Ankorstore / WooCommerce)', () => {
  it('maps title to name', () => {
    const body = untransformCollection({ title: 'Summer' })
    expect(body.name).toBe('Summer')
  })

  it('maps handle to slug', () => {
    const body = untransformCollection({ handle: 'summer-sale' })
    expect(body.slug).toBe('summer-sale')
  })

  it('maps description', () => {
    const body = untransformCollection({ description: 'A great collection' })
    expect(body.description).toBe('A great collection')
  })

  it('maps image url to image.src when present', () => {
    const body = untransformCollection({
      image: { url: 'https://cdn.example.com/img.jpg', alt: 'Alt text' },
    })
    expect((body.image as Record<string, unknown>).src).toBe('https://cdn.example.com/img.jpg')
  })

  it('omits image key when no image url', () => {
    const body = untransformCollection({ title: 'Test' })
    expect(body.image).toBeUndefined()
  })
})
