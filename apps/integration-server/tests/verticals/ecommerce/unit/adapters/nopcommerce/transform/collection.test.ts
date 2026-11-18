import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawNopCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/nopcommerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawNopCategory> = {}): RawNopCategory {
  return {
    id: 42,
    name: 'T-Shirts',
    description: 'All cotton tees',
    se_name: 't-shirts',
    published: true,
    display_order: 1,
    parent_category_id: null,
    image: {
      id: 100,
      src: 'https://cdn.example.com/cats/tshirts.jpg',
      alt: 'T-Shirts category',
    },
    updated_on_utc: '2024-03-15T10:00:00Z',
    product_ids: [10, 20, 30],
    ...overrides,
  }
}

describe('transformCollection (nopCommerce)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('42')
    expect(result.title).toBe('T-Shirts')
    expect(result.handle).toBe('t-shirts')
    expect(result.description).toBe('All cotton tees')
    expect(result.type).toBe('MANUAL')
  })

  it('maps product ids as strings', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual(['10', '20', '30'])
  })

  it('maps category image', () => {
    const result = transformCollection(makeCategory())
    expect(result.image).toEqual({
      id: '100',
      url: 'https://cdn.example.com/cats/tshirts.jpg',
      alt: 'T-Shirts category',
    })
  })

  it('handles missing image', () => {
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
    expect(body['name']).toBe('T-Shirts')
    expect(body['se_name']).toBe('t-shirts')
    expect(body['description']).toBe('All cotton tees')
  })
})
