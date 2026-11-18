import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWooCommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/gambio/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawWooCommerceCategory> = {}): RawWooCommerceCategory {
  return {
    id: 10,
    name: 'Summer Collection',
    slug: 'summer-collection',
    description: 'Fresh styles for summer.',
    image: {
      id: 77,
      src: 'https://cdn.example.com/summer.jpg',
      alt: 'Summer banner',
    },
    ...overrides,
  }
}

describe('transformCollection (Gambio / WooCommerce)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('10')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Summer Collection')
    expect(result.handle).toBe('summer-collection')
    expect(result.description).toBe('Fresh styles for summer.')
  })

  it('hardcodes type to MANUAL (WC categories are always manual)', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('hardcodes productIds to empty array', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual([])
  })

  it('maps image', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.example.com/summer.jpg')
    expect(result.image?.alt).toBe('Summer banner')
  })

  it('returns undefined image when src is absent', () => {
    const result = transformCollection(makeCategory({ image: { src: undefined } }))
    expect(result.image).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const back = untransformCollection(canonical)
    expect(back.name).toBe('Summer Collection')
    expect(back.slug).toBe('summer-collection')
    expect(back.description).toBe('Fresh styles for summer.')
  })
})
