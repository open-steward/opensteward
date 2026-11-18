import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWooCommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/wildberries/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawWooCommerceCategory> = {}): RawWooCommerceCategory {
  return {
    id: 9,
    name: 'Electronics',
    slug: 'electronics',
    description: 'Electronic devices and accessories',
    count: 42,
    ...overrides,
  }
}

describe('transformCollection (Wildberries/WooCommerce)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('9')
    expect(result.title).toBe('Electronics')
    expect(result.handle).toBe('electronics')
    expect(result.description).toBe('Electronic devices and accessories')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('always sets productIds to empty array', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual([])
  })

  it('maps image when present', () => {
    const result = transformCollection(
      makeCategory({
        image: {
          id: 10,
          src: 'https://example.com/electronics.jpg',
          alt: 'Electronics',
        },
      }),
    )
    expect(result.image).toMatchObject({
      id: '10',
      url: 'https://example.com/electronics.jpg',
      alt: 'Electronics',
    })
  })

  it('omits image when not provided', () => {
    const result = transformCollection(makeCategory({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('omits image when src is missing', () => {
    const result = transformCollection(makeCategory({ image: { id: 1, src: undefined } }))
    expect(result.image).toBeUndefined()
  })

  it('derives image alt from name when alt is absent', () => {
    const result = transformCollection(
      makeCategory({
        image: { id: 10, src: 'https://example.com/img.jpg', name: 'Category Image' },
      }),
    )
    expect(result.image?.alt).toBe('Category Image')
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    expect(() => CollectionSchema.parse(transformCollection(makeCategory()))).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeCategory()
    expect(transformCollection(raw).metadata).toBe(raw)
  })
})

describe('untransformCollection (Wildberries/WooCommerce)', () => {
  it('maps title, handle and description back to WC body', () => {
    const result = untransformCollection({
      title: 'Electronics',
      handle: 'electronics',
      description: 'Devices',
    })
    expect(result.name).toBe('Electronics')
    expect(result.slug).toBe('electronics')
    expect(result.description).toBe('Devices')
  })

  it('maps image url and alt to WC image body', () => {
    const result = untransformCollection({
      image: { url: 'https://example.com/img.jpg', alt: 'Image Alt' },
    })
    const img = result.image as Record<string, unknown>
    expect(img['src']).toBe('https://example.com/img.jpg')
    expect(img['alt']).toBe('Image Alt')
  })

  it('omits image body when image url is absent', () => {
    const result = untransformCollection({ title: 'Test' })
    expect(result.image).toBeUndefined()
  })
})
