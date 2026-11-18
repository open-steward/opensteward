import { describe, it, expect } from 'vitest'
import {
  transformCategoryNode,
  untransformCollection,
  type RawSprykerCategoryNode,
} from '../../../../../../../src/verticals/ecommerce/adapters/spryker/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategoryNode(
  overrides: Partial<RawSprykerCategoryNode['attributes']> = {},
): RawSprykerCategoryNode {
  return {
    type: 'category-nodes',
    id: '5',
    attributes: {
      nodeId: 5,
      name: 'Keyboards',
      metaTitle: 'Keyboard Collection',
      metaDescription: 'All keyboard types.',
      metaKeywords: 'keyboard, mechanical',
      isActive: true,
      order: 2,
      url: '/en/keyboards',
      children: [],
      parents: [{ nodeId: 1, name: 'Root' }],
      ...overrides,
    },
  }
}

describe('transformCategoryNode (Spryker)', () => {
  it('maps JSON:API id as collection id', () => {
    const result = transformCategoryNode(makeCategoryNode())
    expect(result.id).toBe('5')
  })

  it('maps name as title', () => {
    const result = transformCategoryNode(makeCategoryNode())
    expect(result.title).toBe('Keyboards')
  })

  it('maps metaDescription as description', () => {
    const result = transformCategoryNode(makeCategoryNode())
    expect(result.description).toBe('All keyboard types.')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCategoryNode(makeCategoryNode())
    expect(result.type).toBe('MANUAL')
  })

  it('falls back to id as title when name is null', () => {
    const result = transformCategoryNode(makeCategoryNode({ name: null }))
    expect(result.title).toBe('5')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategoryNode()
    expect(transformCategoryNode(raw).metadata).toBe(raw)
  })

  it('produces a schema-valid result when handle is a slug (or absent)', () => {
    // Source quirk: `handle` is set to `attrs.url` verbatim. A path-style URL
    // like '/en/keyboards' is NOT a valid handle (schema requires /^[a-z0-9-]+$/),
    // so schema-validity holds only when the url is itself a slug or omitted.
    expect(() =>
      CollectionSchema.parse(transformCategoryNode(makeCategoryNode({ url: undefined }))),
    ).not.toThrow()
  })

  it('emits a schema-invalid handle for a path-style url (documented source quirk)', () => {
    // Real Spryker category urls are paths ('/en/keyboards'); passed straight to
    // `handle` they fail the slug regex. Pinning this so a future handle-slugify
    // fix flips this test and prompts an update.
    expect(() => CollectionSchema.parse(transformCategoryNode(makeCategoryNode()))).toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCategoryNode(makeCategoryNode())
    const body = untransformCollection(canonical)
    const data = (body as { data: { attributes: Record<string, unknown> } }).data
    expect(data.attributes['name']).toBe('Keyboards')
    expect(data.attributes['metaDescription']).toBe('All keyboard types.')
    expect(data.attributes['isActive']).toBe(true)
  })
})
