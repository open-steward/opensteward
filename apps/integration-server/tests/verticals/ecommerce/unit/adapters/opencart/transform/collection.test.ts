import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawOpenCartCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/opencart/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(
  overrides: Partial<RawOpenCartCategory> = {},
): RawOpenCartCategory {
  return {
    category_id: 5,
    name: 'Electronics',
    description: 'All electronic products',
    parent_id: 0,
    image: 'catalog/category/electronics.jpg',
    sort_order: '1',
    status: 1,
    date_added: '2024-01-01T00:00:00.000Z',
    date_modified: '2024-02-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformCollection (OpenCart)', () => {
  it('maps core fields and always sets MANUAL type', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.id).toBe('5')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Electronics')
    expect(result.description).toBe('All electronic products')
    expect(result.type).toBe('MANUAL')
    expect(result.image?.url).toBe('/catalog/category/electronics.jpg')
    expect(result.productIds).toEqual([])
  })

  it('handles null image gracefully', () => {
    const result = transformCollection(makeCategory({ image: null }))
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
    const body = untransformCollection(canonical)
    expect(body['name']).toBe('Electronics')
    expect(body['description']).toBe('All electronic products')
  })
})
