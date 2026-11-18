import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawPrestaShopCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/prestashop/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(
  overrides: Partial<RawPrestaShopCategory> = {},
): RawPrestaShopCategory {
  return {
    id: 3,
    name: 'Summer Sale',
    link_rewrite: 'summer-sale',
    description: 'Hot deals',
    id_parent: 2,
    active: 1,
    position: 1,
    associations: {
      products: [{ id: 10 }, { id: 20 }],
    },
    ...overrides,
  }
}

describe('transformCollection (PrestaShop)', () => {
  it('maps core fields and always sets MANUAL type', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.id).toBe('3')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Summer Sale')
    expect(result.handle).toBe('summer-sale')
    expect(result.description).toBe('Hot deals')
    expect(result.type).toBe('MANUAL')
  })

  it('extracts product ids from associations', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual(['10', '20'])
  })

  it('returns empty productIds when no associations', () => {
    const result = transformCollection(makeCategory({ associations: undefined }))
    expect(result.productIds).toEqual([])
  })

  it('handles multi-language name field', () => {
    const result = transformCollection(makeCategory({ name: { '1': 'English', '2': 'French' } }))
    expect(result.title).toBe('English')
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
    expect(body['name']).toBe('Summer Sale')
    expect(body['link_rewrite']).toBe('summer-sale')
    expect(body['description']).toBe('Hot deals')
  })
})
