import { describe, it, expect } from 'vitest'
import {
  transformCategory,
  flattenCategories,
  type RawNhnCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/nhn-commerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawNhnCategory> = {}): RawNhnCategory {
  return {
    categoryNo: 100,
    label: 'Electronics',
    depth: 1,
    icon: '//cdn.example.com/electronics.png',
    content: 'All electronics',
    displayOrder: 1,
    ...overrides,
  }
}

describe('transformCategory (NHN Commerce)', () => {
  it('maps categoryNo to string canonical id', () => {
    const result = transformCategory(makeRaw())
    expect(result.id).toBe('100')
  })

  it('maps label to title', () => {
    const result = transformCategory(makeRaw())
    expect(result.title).toBe('Electronics')
  })

  it('always emits type=MANUAL', () => {
    const result = transformCategory(makeRaw())
    expect(result.type).toBe('MANUAL')
  })

  it('maps content to description', () => {
    const result = transformCategory(makeRaw())
    expect(result.description).toBe('All electronics')
  })

  it('prepends https: to protocol-relative icon URL', () => {
    const result = transformCategory(makeRaw())
    expect(result.image).toMatchObject({
      url: 'https://cdn.example.com/electronics.png',
    })
  })

  it('handles absolute icon URL without modification', () => {
    const result = transformCategory(makeRaw({ icon: 'https://cdn.example.com/icon.png' }))
    expect(result.image!.url).toBe('https://cdn.example.com/icon.png')
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCategory(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('handles missing icon gracefully', () => {
    const result = transformCategory(makeRaw({ icon: null }))
    expect(result.image).toBeUndefined()
  })
})

describe('flattenCategories (NHN Commerce)', () => {
  it('flattens nested category tree into a flat list', () => {
    const tree: RawNhnCategory[] = [
      {
        ...makeRaw({ categoryNo: 1, label: 'Top' }),
        children: [
          { ...makeRaw({ categoryNo: 2, label: 'Sub1' }) },
          {
            ...makeRaw({ categoryNo: 3, label: 'Sub2' }),
            children: [{ ...makeRaw({ categoryNo: 4, label: 'Sub2a' }) }],
          },
        ],
      },
    ]
    const result = flattenCategories(tree)
    expect(result).toHaveLength(4)
    expect(result.map((c) => c.id)).toEqual(['1', '2', '3', '4'])
  })

  it('handles empty array', () => {
    expect(flattenCategories([])).toEqual([])
  })
})
