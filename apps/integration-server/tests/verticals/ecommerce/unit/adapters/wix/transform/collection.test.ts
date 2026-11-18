import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWixCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/wix/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawWixCollection> = {}): RawWixCollection {
  return {
    id: 'col-001',
    name: 'Summer Sale',
    slug: 'summer-sale',
    description: 'Hot deals for summer',
    visible: true,
    numberOfProducts: 12,
    media: {
      mainMedia: {
        fullUrl: 'https://static.wixstatic.com/col/banner.jpg',
        altText: 'Summer banner',
        width: 800,
        height: 400,
      },
    },
    updatedDate: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCollection())
    expect(result.id).toBe('col-001')
    expect(result.title).toBe('Summer Sale')
    expect(result.handle).toBe('summer-sale')
    expect(result.description).toBe('Hot deals for summer')
    expect(result.type).toBe('MANUAL')
  })

  it('maps image from mainMedia', () => {
    const result = transformCollection(makeCollection())
    expect(result.image?.url).toBe('https://static.wixstatic.com/col/banner.jpg')
    expect(result.image?.alt).toBe('Summer banner')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCollection()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCollection())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeCollection())
    const raw = untransformCollection(canonical)
    expect(raw.name).toBe('Summer Sale')
    expect(raw.slug).toBe('summer-sale')
    expect(raw.description).toBe('Hot deals for summer')
  })

  it('handles missing image gracefully', () => {
    const result = transformCollection(makeCollection({ media: undefined }))
    expect(result.image).toBeUndefined()
  })
})
