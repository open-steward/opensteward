import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawScapiCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/salesforce-commerce-cloud/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawScapiCategory> = {}): RawScapiCategory {
  return {
    id: 'footwear',
    name: 'Footwear',
    description: 'All types of shoes and boots',
    parentCategoryId: 'clothing',
    image: 'https://cdn.sfcc.com/footwear.jpg',
    online: true,
    createdAt: '2023-01-01T00:00:00Z',
    lastModified: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps id, title, handle', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('footwear')
    expect(result.title).toBe('Footwear')
    expect(result.handle).toBe('footwear')
  })

  it('maps description', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('All types of shoes and boots')
  })

  it('defaults type to MANUAL', () => {
    expect(transformCollection(makeCategory()).type).toBe('MANUAL')
  })

  it('maps image url', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.sfcc.com/footwear.jpg')
  })

  it('uses thumbnail when image absent', () => {
    const result = transformCollection(
      makeCategory({ image: null, thumbnail: 'https://cdn.sfcc.com/thumb.jpg' }),
    )
    expect(result.image?.url).toBe('https://cdn.sfcc.com/thumb.jpg')
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
    const raw = untransformCollection(canonical)
    expect(raw.name).toBe('Footwear')
    expect(raw.description).toBe('All types of shoes and boots')
  })
})
