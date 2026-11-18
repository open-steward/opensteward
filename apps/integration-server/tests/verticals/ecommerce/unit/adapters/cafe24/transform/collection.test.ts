import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawCafe24Category,
} from '../../../../../../../src/verticals/ecommerce/adapters/cafe24/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

describe('transformCollection (cafe24)', () => {
  const raw: RawCafe24Category = {
    category_no: 10,
    category_name: 'Electronics',
    description: '<p>All electronics</p>',
    use_main: 'T',
    display_type: 'G',
    parent_category_no: null,
    created_date: '2024-03-01T00:00:00Z',
    updated_date: '2024-03-01T00:00:00Z',
  }

  it('maps id from category_no', () => {
    expect(transformCollection(raw).id).toBe('10')
  })

  it('maps title from category_name', () => {
    expect(transformCollection(raw).title).toBe('Electronics')
  })

  it('maps description', () => {
    expect(transformCollection(raw).description).toBe('<p>All electronics</p>')
  })

  it('always sets type to MANUAL', () => {
    expect(transformCollection(raw).type).toBe('MANUAL')
  })

  it('maps updatedAt via toIsoDatetime', () => {
    // toIsoDatetime normalizes to include milliseconds
    expect(transformCollection(raw).updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes CollectionSchema validation', () => {
    expect(() => CollectionSchema.parse(transformCollection(raw))).not.toThrow()
  })

  it('handles null description', () => {
    const result = transformCollection({ ...raw, description: null })
    expect(result.description).toBeUndefined()
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('handles null updated_date', () => {
    const result = transformCollection({ ...raw, updated_date: null })
    expect(result.updatedAt).toBeUndefined()
  })
})

describe('untransformCollection (cafe24)', () => {
  it('round-trips category_name and description', () => {
    const canonical = transformCollection(raw)
    const body = untransformCollection(canonical)
    expect(body.category_name).toBe('Electronics')
    expect(body.description).toBe('<p>All electronics</p>')
  })
})

const raw: RawCafe24Category = {
  category_no: 10,
  category_name: 'Electronics',
  description: '<p>All electronics</p>',
  updated_date: '2024-03-01T00:00:00Z',
}
