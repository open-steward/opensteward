import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawYokartCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/yokart/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawYokartCategory> = {}): RawYokartCategory {
  return {
    prodcat_id: 5,
    prodcat_name: 'Footwear',
    prodcat_slug: 'footwear',
    prodcat_image: 'https://example.com/cat-footwear.jpg',
    prodcat_description: 'All types of shoes and boots',
    prodcat_parent: null,
    prodcat_level: 1,
    prodcat_order: 2,
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('5')
    expect(result.title).toBe('Footwear')
    expect(result.handle).toBe('footwear')
    expect(result.description).toBe('All types of shoes and boots')
  })

  it('sets type to MANUAL (Yo!Kart has no smart collections)', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('sets productIds to empty array', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual([])
  })

  it('maps image URL', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://example.com/cat-footwear.jpg')
  })

  it('sets image to undefined when prodcat_image is null', () => {
    const result = transformCollection(makeCategory({ prodcat_image: null }))
    expect(result.image).toBeUndefined()
  })

  it('sets description to undefined when prodcat_description is empty string', () => {
    const result = transformCollection(makeCategory({ prodcat_description: '' }))
    expect(result.description).toBeUndefined()
  })

  it('converts numeric prodcat_id to string', () => {
    const result = transformCollection(makeCategory({ prodcat_id: 123 }))
    expect(result.id).toBe('123')
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical)
    expect(raw['prodcat_name']).toBe('Footwear')
    expect(raw['prodcat_slug']).toBe('footwear')
    expect(raw['prodcat_description']).toBe('All types of shoes and boots')
    expect(raw['prodcat_image']).toBe('https://example.com/cat-footwear.jpg')
  })

  it('untransformCollection handles missing image gracefully', () => {
    const canonical = transformCollection(makeCategory({ prodcat_image: null }))
    const raw = untransformCollection(canonical)
    expect(raw['prodcat_image']).toBeUndefined()
  })
})
