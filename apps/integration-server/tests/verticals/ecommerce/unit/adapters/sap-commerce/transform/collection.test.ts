import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  buildPatchForCollection,
  type RawSapCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawSapCategory> = {}): RawSapCategory {
  return {
    id: 'cat-electronics',
    code: 'electronics',
    name: 'Electronics',
    url: '/categories/electronics',
    description: 'All electronic products',
    image: { url: 'https://cdn.example/electronics.jpg', altText: 'Electronics banner' },
    subcategories: [
      { code: 'laptops', name: 'Laptops' },
    ],
    ...overrides,
  }
}

describe('transformCollection (sap-commerce)', () => {
  it('maps core fields', () => {
    const r = transformCollection(makeCategory())
    expect(r.id).toBe('cat-electronics')
    expect(r.title).toBe('Electronics')
    expect(r.description).toBe('All electronic products')
    expect(r.type).toBe('MANUAL')
  })

  it('maps handle from url', () => {
    const r = transformCollection(makeCategory())
    expect(r.handle).toBe('categories-electronics')
  })

  it('maps category image', () => {
    const r = transformCollection(makeCategory())
    expect(r.image?.url).toBe('https://cdn.example/electronics.jpg')
    expect(r.image?.alt).toBe('Electronics banner')
  })

  it('falls back to code when id is absent', () => {
    const r = transformCollection(makeCategory({ id: undefined }))
    expect(r.id).toBe('electronics')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const r = transformCollection(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const r = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(r)).not.toThrow()
  })

  it('sets productIds to empty array', () => {
    const r = transformCollection(makeCategory())
    expect(r.productIds).toEqual([])
  })
})

describe('untransformCollection (sap-commerce)', () => {
  it('builds creation body', () => {
    const body = untransformCollection({
      id: 'new-cat',
      title: 'New Category',
      description: 'A new category',
    }) as Record<string, unknown>
    expect(body['name']).toBe('New Category')
    expect(body['id']).toBe('new-cat')
  })
})

describe('buildPatchForCollection (sap-commerce)', () => {
  it('includes only provided fields', () => {
    const patch = buildPatchForCollection({ title: 'Updated' })
    expect(patch['name']).toBe('Updated')
    expect(patch).not.toHaveProperty('description')
  })
})
