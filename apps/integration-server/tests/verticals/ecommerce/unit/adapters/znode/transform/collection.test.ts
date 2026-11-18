import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawZnodeCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/znode/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawZnodeCategory> = {}): RawZnodeCategory {
  return {
    CategoryId: 10,
    CategoryName: 'Industrial Equipment',
    CategoryDescription: 'Heavy machinery and equipment',
    SEOUrl: 'industrial-equipment',
    ParentCategoryId: 1,
    DisplayOrder: 5,
    IsActive: true,
    ModifiedDate: '2024-06-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('transformCollection (Znode)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('10')
    expect(result.title).toBe('Industrial Equipment')
    expect(result.description).toBe('Heavy machinery and equipment')
    expect(result.handle).toBe('industrial-equipment')
    expect(result.type).toBe('MANUAL')
  })

  it('stores parentCategoryId in metadata', () => {
    const result = transformCollection(makeCategory())
    expect((result.metadata as Record<string, unknown>)['parentCategoryId']).toBe('1')
  })

  it('handles null parent category', () => {
    const result = transformCollection(makeCategory({ ParentCategoryId: null }))
    expect((result.metadata as Record<string, unknown>)['parentCategoryId']).toBeUndefined()
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const body = untransformCollection({ title: 'Test', description: 'Desc' }) as Record<string, unknown>
    expect(body['CategoryName']).toBe('Test')
    expect(body['CategoryDescription']).toBe('Desc')
  })
})
