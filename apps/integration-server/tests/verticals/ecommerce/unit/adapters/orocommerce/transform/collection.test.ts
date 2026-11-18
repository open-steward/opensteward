import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawOroCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/orocommerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawOroCategory> = {}): RawOroCategory {
  return {
    id: '10',
    title: 'Industrial Equipment',
    description: 'Heavy machinery and equipment',
    updatedAt: '2024-06-01T08:00:00.000Z',
    parentCategory: { id: '1' },
    _type: 'mastercatalogcategories',
    ...overrides,
  }
}

describe('transformCollection (OroCommerce)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('10')
    expect(result.title).toBe('Industrial Equipment')
    expect(result.description).toBe('Heavy machinery and equipment')
    expect(result.type).toBe('MANUAL')
  })

  it('stores parentCategoryId in metadata', () => {
    const result = transformCollection(makeCategory())
    expect((result.metadata as Record<string, unknown>)['parentCategoryId']).toBe('1')
  })

  it('falls back to titles array when title is missing', () => {
    const result = transformCollection(
      makeCategory({
        title: undefined,
        titles: [
          { string: 'Equipos Industriales', locale: 'es_ES' },
          { string: 'Industrial Equipment', locale: null },
        ],
      }),
    )
    expect(result.title).toBe('Industrial Equipment')
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const body = untransformCollection({ title: 'Test', description: 'Desc' }) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('mastercatalogcategories')
    const titles = body.data.attributes['titles'] as Array<{ string: string }>
    expect(titles[0]!.string).toBe('Test')
  })
})
