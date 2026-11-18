import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopwareCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawShopwareCategory> = {}): RawShopwareCategory {
  return {
    id: 'cat-abc123',
    name: 'Summer Collection',
    active: true,
    type: 'page',
    description: 'All items for summer 2024',
    level: 2,
    createdAt: '2024-01-15T10:00:00+00:00',
    updatedAt: '2024-02-20T14:00:00.000Z',
    ...overrides,
  }
}

describe('transformCollection (Shopware)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('cat-abc123')
    expect(result.title).toBe('Summer Collection')
    expect(result.description).toBe('All items for summer 2024')
    expect(result.type).toBe('MANUAL')
    expect(result.updatedAt).toBe('2024-02-20T14:00:00.000Z')
  })

  it('handles null description', () => {
    const result = transformCollection(makeCategory({ description: null }))
    expect(result.description).toBeUndefined()
  })

  it('handles missing name', () => {
    const result = transformCollection(makeCategory({ name: undefined }))
    expect(result.title).toBe('')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('validates against CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (Shopware)', () => {
  it('maps canonical fields to Shopware shape', () => {
    const body = untransformCollection({
      title: 'Winter Sale',
      description: 'Warm stuff',
    })
    expect(body['name']).toBe('Winter Sale')
    expect(body['description']).toBe('Warm stuff')
    expect(body['type']).toBe('page')
    expect(body['active']).toBe(true)
  })
})
