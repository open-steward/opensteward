import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWooCommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/yampi/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawWooCommerceCategory> = {}): RawWooCommerceCategory {
  return {
    id: 8,
    name: 'Summer Apparel',
    slug: 'summer-apparel',
    description: 'Clothes for warm weather',
    count: 12,
    ...overrides,
  }
}

describe('transformCollection (Yampi/WooCommerce)', () => {
  it('maps id, title, handle, and description', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('8')
    expect(result.title).toBe('Summer Apparel')
    expect(result.handle).toBe('summer-apparel')
    expect(result.description).toBe('Clothes for warm weather')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('sets productIds to empty array', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual([])
  })

  it('maps image when present', () => {
    const result = transformCollection(
      makeCategory({
        image: { id: 5, src: 'https://example.com/img.jpg', alt: 'summer', name: 'summer' },
      }),
    )
    expect(result.image?.url).toBe('https://example.com/img.jpg')
    expect(result.image?.alt).toBe('summer')
    expect(result.image?.id).toBe('5')
  })

  it('omits image when image has no src', () => {
    const result = transformCollection(makeCategory({ image: { id: 5 } }))
    expect(result.image).toBeUndefined()
  })

  it('omits image when null', () => {
    const result = transformCollection(makeCategory({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    expect(() => CollectionSchema.parse(transformCollection(makeCategory()))).not.toThrow()
  })
})

describe('untransformCollection (Yampi/WooCommerce)', () => {
  it('maps title, handle, and description back to WC fields', () => {
    const result = untransformCollection({
      title: 'Summer Apparel',
      handle: 'summer-apparel',
      description: 'Clothes for warm weather',
    })
    expect(result.name).toBe('Summer Apparel')
    expect(result.slug).toBe('summer-apparel')
    expect(result.description).toBe('Clothes for warm weather')
  })

  it('maps image url back to WC image shape', () => {
    const result = untransformCollection({
      title: 'Hats',
      image: { url: 'https://example.com/hat.jpg', alt: 'hat' },
    })
    expect((result.image as Record<string, unknown>)?.['src']).toBe('https://example.com/hat.jpg')
    expect((result.image as Record<string, unknown>)?.['alt']).toBe('hat')
  })

  it('omits image when no image provided', () => {
    const result = untransformCollection({ title: 'Shoes' })
    expect(result.image).toBeUndefined()
  })
})
