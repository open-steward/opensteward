import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  type RawKauflandCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/kaufland-marketplace/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawKauflandCategory> = {}): RawKauflandCategory {
  return {
    id_category: 101,
    name: 'Electronics',
    id_parent_category: null,
    ...overrides,
  }
}

describe('transformCollection (kaufland-marketplace)', () => {
  it('maps id_category to string id', () => {
    const result = transformCollection(makeCategory({ id_category: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps name to title', () => {
    const result = transformCollection(makeCategory({ name: 'Books' }))
    expect(result.title).toBe('Books')
  })

  it('falls back to Category {id} when name is missing', () => {
    const result = transformCollection(makeCategory({ id_category: 7, name: undefined }))
    expect(result.title).toBe('Category 7')
  })

  it('falls back to Category {id} when name is null', () => {
    const result = transformCollection(makeCategory({ id_category: 8, name: null }))
    expect(result.title).toBe('Category 8')
  })

  it('hardcodes type as MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('sets handle to undefined (no slugs on Kaufland)', () => {
    const result = transformCollection(makeCategory())
    expect(result.handle).toBeUndefined()
  })

  it('sets description to undefined', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBeUndefined()
  })

  it('sets image to undefined', () => {
    const result = transformCollection(makeCategory())
    expect(result.image).toBeUndefined()
  })

  it('stores raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})
