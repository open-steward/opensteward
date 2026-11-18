import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawSquareCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/square/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawSquareCategory> = {}): RawSquareCategory {
  return {
    id: 'CAT_COFFEE',
    type: 'CATEGORY',
    category_data: {
      name: 'Hot Beverages',
    },
    updated_at: '2024-03-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (Square)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('CAT_COFFEE')
    expect(result.title).toBe('Hot Beverages')
    expect(result.type).toBe('MANUAL')
    expect(result.updatedAt).toBe('2024-03-01T10:00:00Z')
  })

  it('handles missing category_data name', () => {
    const result = transformCollection(makeCategory({ category_data: {} }))
    expect(result.title).toBe('')
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
    expect((raw['category_data'] as Record<string, unknown>)['name']).toBe('Hot Beverages')
    expect(raw['type']).toBe('CATEGORY')
  })
})
