/**
 * Optimizely Configured Commerce `transformCollection` / `flattenCategories`
 * — maps the Storefront v1 CategoryModel tree to the canonical Collection
 * shape. Docs:
 * https://docs.developers.optimizely.com/configured-commerce/reference/categoriesv1_getcollectionasync
 */
import { describe, it, expect } from 'vitest'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'
import {
  transformCollection,
  flattenCategories,
  type RawOptimizelyCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/optimizely-configured-commerce/transform/collection'

describe('Optimizely transformCollection', () => {
  it('produces output that satisfies the canonical Collection schema', () => {
    const out = transformCollection({
      id: 'c1',
      name: 'Accessories',
      shortDescription: 'Keyboards, mice, and other desk accessories.',
      urlSegment: 'accessories',
    })
    expect(() => CollectionSchema.parse(out)).not.toThrow()
  })

  it('minimal input still satisfies the schema', () => {
    expect(() => CollectionSchema.parse(transformCollection({ id: 'min' }))).not.toThrow()
  })

  it('prefers name for title, falling back to id', () => {
    expect(transformCollection({ id: '1', name: 'Accessories' }).title).toBe('Accessories')
    expect(transformCollection({ id: '2' }).title).toBe('2')
  })

  it('slugifies urlSegment into a handle', () => {
    expect(transformCollection({ id: '3', urlSegment: 'Home & Office' }).handle).toBe('home-office')
  })

  it('preserves the raw record in metadata', () => {
    const raw: RawOptimizelyCategory = { id: '4' }
    expect(transformCollection(raw).metadata).toBe(raw)
  })
})

describe('Optimizely flattenCategories', () => {
  it('flattens a hierarchical tree into every node, parent and child alike', () => {
    const tree: RawOptimizelyCategory[] = [
      {
        id: 'root',
        name: 'Root',
        subCategories: [
          { id: 'child-1', name: 'Child 1' },
          {
            id: 'child-2',
            name: 'Child 2',
            subCategories: [{ id: 'grandchild', name: 'Grandchild' }],
          },
        ],
      },
    ]
    const flat = flattenCategories(tree)
    expect(flat.map((c) => c.id)).toEqual(['root', 'child-1', 'child-2', 'grandchild'])
  })

  it('returns an empty array for undefined/null/empty input', () => {
    expect(flattenCategories(undefined)).toEqual([])
    expect(flattenCategories(null)).toEqual([])
    expect(flattenCategories([])).toEqual([])
  })

  it('does not throw when a node has no subCategories', () => {
    expect(() => flattenCategories([{ id: 'leaf' }])).not.toThrow()
  })
})
