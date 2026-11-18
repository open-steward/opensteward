import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawSolidusTaxon,
} from '../../../../../../../src/verticals/ecommerce/adapters/solidus/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeTaxon(overrides: Partial<RawSolidusTaxon> = {}): RawSolidusTaxon {
  return {
    id: 5,
    name: 'Hoodies',
    permalink: 'categories-hoodies',
    description: 'All our hoodie styles',
    parent_id: 1,
    taxonomy_id: 1,
    position: 2,
    depth: 1,
    is_root: false,
    is_leaf: true,
    updated_at: '2024-03-01T12:00:00.000Z',
    created_at: '2024-01-15T08:00:00.000Z',
    product_ids: [42, 43, 44],
    ...overrides,
  }
}

describe('transformCollection (Solidus)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeTaxon())
    expect(result.id).toBe('5')
    expect(result.title).toBe('Hoodies')
    expect(result.handle).toBe('categories-hoodies')
    expect(result.description).toBe('All our hoodie styles')
    expect(result.type).toBe('MANUAL')
  })

  it('maps product IDs as strings', () => {
    const result = transformCollection(makeTaxon())
    expect(result.productIds).toEqual(['42', '43', '44'])
  })

  it('handles missing product_ids', () => {
    const result = transformCollection(makeTaxon({ product_ids: undefined }))
    expect(result.productIds).toBeUndefined()
  })

  it('preserves metadata', () => {
    const raw = makeTaxon()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies CollectionSchema', () => {
    const result = transformCollection(makeTaxon())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeTaxon())
    const body = untransformCollection(canonical) as { taxon: Record<string, unknown> }
    expect(body.taxon['name']).toBe('Hoodies')
    expect(body.taxon['permalink']).toBe('categories-hoodies')
    expect(body.taxon['description']).toBe('All our hoodie styles')
  })
})
