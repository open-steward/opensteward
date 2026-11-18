import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  flattenCategories,
  type RawTrendyolCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/trendyol/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawTrendyolCategory> = {}): RawTrendyolCategory {
  return {
    id: 411,
    name: 'Electronics',
    parentId: null,
    parentName: null,
    subCategories: [],
    ...overrides,
  }
}

describe('transformCollection (Trendyol)', () => {
  it('maps id as string and title from name', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.id).toBe('411')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Electronics')
  })

  it('always sets type to MANUAL with empty productIds', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
    expect(result.productIds).toEqual([])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('works with string id', () => {
    const result = transformCollection(makeCategory({ id: '999' }))
    expect(result.id).toBe('999')
  })
})

describe('flattenCategories (Trendyol)', () => {
  it('flattens a nested tree into a flat list', () => {
    const tree: RawTrendyolCategory[] = [
      {
        id: 1,
        name: 'Root',
        subCategories: [
          { id: 2, name: 'Child A', subCategories: [] },
          {
            id: 3,
            name: 'Child B',
            subCategories: [{ id: 4, name: 'Grandchild', subCategories: [] }],
          },
        ],
      },
    ]
    const flat = flattenCategories(tree)
    expect(flat).toHaveLength(4)
    expect(flat.map((c) => c.id)).toEqual([1, 2, 3, 4])
  })

  it('returns a single item for a leaf node', () => {
    const flat = flattenCategories([{ id: 10, name: 'Leaf', subCategories: [] }])
    expect(flat).toHaveLength(1)
    expect(flat[0]!.name).toBe('Leaf')
  })
})
