import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawFabricCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/fabric/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawFabricCategory> = {}): RawFabricCategory {
  return {
    id: 'cat-001',
    name: 'Summer Collection',
    description: 'Best items for summer.',
    slug: 'summer-collection',
    parent_id: 'cat-root',
    position: 0,
    product_ids: ['prod-001', 'prod-002'],
    image: {
      id: 'img-001',
      url: 'https://cdn.fabric.inc/cat.jpg',
      alt_text: 'Summer banner',
    },
    created_at: '2024-03-01T08:00:00Z',
    updated_at: '2024-06-15T12:00:00Z',
    published_at: '2024-03-02T08:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (fabric)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('cat-001')
    expect(result.title).toBe('Summer Collection')
    expect(result.handle).toBe('summer-collection')
    expect(result.description).toBe('Best items for summer.')
    expect(result.type).toBe('MANUAL')
    expect(result.productIds).toEqual(['prod-001', 'prod-002'])
  })

  it('maps image', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.fabric.inc/cat.jpg')
    expect(result.image?.alt).toBe('Summer banner')
  })

  it('handles missing image', () => {
    const result = transformCollection(makeCategory({ image: undefined }))
    expect(result.image).toBeUndefined()
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (fabric)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformCollection(makeCategory())
    const body = untransformCollection(canonical) as Record<string, unknown>
    expect(body['name']).toBe('Summer Collection')
    expect(body['slug']).toBe('summer-collection')
    expect(body['description']).toBe('Best items for summer.')
    expect(body['product_ids']).toEqual(['prod-001', 'prod-002'])
  })
})
