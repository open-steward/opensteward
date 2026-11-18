/**
 * BASE category ↔ canonical Collection.
 * Docs: https://docs.thebase.in/api/categories , https://docs.thebase.in/api/categories/add
 */
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/base-ec/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

describe('transformCollection (BASE)', () => {
  it('maps category fields', () => {
    const raw = { category_id: 1234, name: 'メンズ', list_order: 1, number: 1, parent_number: 0, code: '0001' }
    const result = transformCollection(raw)
    expect(result.id).toBe('1234')
    expect(result.title).toBe('メンズ')
    expect(result.metadata).toBe(raw)
  })

  it('satisfies CollectionSchema', () => {
    const result = transformCollection({ category_id: 1, name: 'Shoes' })
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (BASE)', () => {
  it('maps title to name', () => {
    expect(untransformCollection({ title: 'Shoes' })).toEqual({ name: 'Shoes' })
  })

  it('throws without a title', () => {
    expect(() => untransformCollection({})).toThrow(/requires `title`/)
  })
})
