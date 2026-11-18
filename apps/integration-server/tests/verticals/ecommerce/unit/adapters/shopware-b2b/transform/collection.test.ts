import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopwareCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopware-b2b/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawShopwareCategory> = {}): RawShopwareCategory {
  return {
    id: 'cat-b2b-001',
    name: 'B2B Industrial Supplies',
    active: true,
    type: 'page',
    description: 'Industrial equipment for business customers',
    level: 2,
    createdAt: '2024-01-15T10:00:00+00:00',
    updatedAt: '2024-02-20T14:00:00+00:00',
    ...overrides,
  }
}

describe('transformCollection (Shopware B2B)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('cat-b2b-001')
    expect(result.title).toBe('B2B Industrial Supplies')
    expect(result.description).toBe('Industrial equipment for business customers')
    expect(result.type).toBe('MANUAL')
  })

  it('handles null description', () => {
    const result = transformCollection(makeCategory({ description: null }))
    expect(result.description).toBeUndefined()
  })

  it('handles missing name', () => {
    const result = transformCollection(makeCategory({ name: undefined }))
    expect(result.title).toBe('')
  })

  it('preserves metadata and validates', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (Shopware B2B)', () => {
  it('maps canonical to Shopware shape', () => {
    const body = untransformCollection({
      title: 'B2B Office Furniture',
      description: 'Desks and chairs',
    })
    expect(body['name']).toBe('B2B Office Furniture')
    expect(body['description']).toBe('Desks and chairs')
    expect(body['type']).toBe('page')
  })
})
