import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShoperCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoper/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawShoperCategory> = {}): RawShoperCategory {
  return {
    category_id: 11,
    parent_id: null,
    translations: {
      pl_PL: {
        name: 'Elektronika',
        description: 'Produkty elektroniczne',
        active: 1,
      },
      en_GB: {
        name: 'Electronics',
        description: 'Electronic products',
        active: 1,
      },
    },
    products: [101, 102, 103],
    add_date: '2023-01-10T00:00:00.000Z',
    edit_date: '2024-02-20T08:00:00.000Z',
    ...overrides,
  }
}

describe('shoper transformCollection', () => {
  it('maps category_id to string id', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('11')
  })

  it('picks pl_PL translation for title and description', () => {
    const result = transformCollection(makeRaw())
    expect(result.title).toBe('Elektronika')
    expect(result.description).toBe('Produkty elektroniczne')
  })

  it('falls back to en_GB when pl_PL is absent', () => {
    const raw = makeRaw({
      translations: {
        en_GB: { name: 'Electronics', description: 'Electronic products', active: 1 },
      },
    })
    const result = transformCollection(raw)
    expect(result.title).toBe('Electronics')
  })

  it('type is always MANUAL', () => {
    const result = transformCollection(makeRaw())
    expect(result.type).toBe('MANUAL')
  })

  it('maps productIds to string array', () => {
    const result = transformCollection(makeRaw())
    expect(result.productIds).toEqual(['101', '102', '103'])
  })

  it('maps edit_date to updatedAt and add_date to publishedAt', () => {
    const result = transformCollection(makeRaw())
    expect(result.updatedAt).toBe('2024-02-20T08:00:00.000Z')
    expect(result.publishedAt).toBe('2023-01-10T00:00:00.000Z')
  })

  it('produces output that passes CollectionSchema', () => {
    const result = transformCollection(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeRaw())
    const back = untransformCollection(canonical)
    expect((back.translations as Record<string, { name: string }>)?.['pl_PL']?.name).toBe(
      'Elektronika',
    )
  })
})
