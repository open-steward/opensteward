import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawVolusionCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/volusion/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawVolusionCategory> = {}): RawVolusionCategory {
  return {
    CategoryID: 201,
    CategoryName: 'Summer Wear',
    CategoryDescription: 'Light clothing for warm weather',
    SEFriendlyName: 'summer-wear',
    CategoryImage: 'https://cdn.volusion.com/cat/summer.jpg',
    IsActive: true,
    SortOrder: 1,
    DateCreated: '2024-01-01T00:00:00Z',
    LastModified: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('201')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Summer Wear')
    expect(result.handle).toBe('summer-wear')
    expect(result.description).toBe('Light clothing for warm weather')
    expect(result.type).toBe('MANUAL')
  })

  it('maps category image', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.volusion.com/cat/summer.jpg')
  })

  it('handles missing image', () => {
    const result = transformCollection(makeCategory({ CategoryImage: null }))
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

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical)
    expect(raw.CategoryName).toBe('Summer Wear')
    expect(raw.CategoryDescription).toBe('Light clothing for warm weather')
    expect(raw.SEFriendlyName).toBe('summer-wear')
  })
})
