import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawBigCartelCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcartel/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(
  overrides: Partial<RawBigCartelCategory> = {},
): RawBigCartelCategory {
  return {
    id: 'cat-42',
    type: 'categories',
    attributes: {
      name: 'Candles',
      permalink: 'candles',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-02-15T12:00:00Z',
    },
    relationships: {
      products: {
        data: [
          { id: 'prod-1', type: 'products' },
          { id: 'prod-2', type: 'products' },
        ],
      },
    },
    ...overrides,
  }
}

describe('transformCollection (Big Cartel)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('cat-42')
    expect(result.title).toBe('Candles')
    expect(result.handle).toBe('candles')
    expect(result.type).toBe('MANUAL')
  })

  it('maps product IDs from relationships', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual(['prod-1', 'prod-2'])
  })

  it('returns empty productIds when no relationships', () => {
    const raw = makeCategory({ relationships: undefined })
    const result = transformCollection(raw)
    expect(result.productIds).toEqual([])
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
})

describe('untransformCollection (Big Cartel)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformCollection(makeCategory())
    const body = untransformCollection(canonical) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('categories')
    expect(body.data.attributes['name']).toBe('Candles')
    expect(body.data.attributes['permalink']).toBe('candles')
  })
})
