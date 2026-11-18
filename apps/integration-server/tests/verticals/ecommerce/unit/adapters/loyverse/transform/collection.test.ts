import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawLoyverseCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/loyverse/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawLoyverseCategory> = {}): RawLoyverseCategory {
  return {
    id: 'cat_001',
    name: 'Beverages',
    color: '#FF5733',
    created_at: '2024-01-15T09:30:00Z',
    ...overrides,
  }
}

describe('transformCollection (Loyverse)', () => {
  it('maps id and title', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('cat_001')
    expect(result.title).toBe('Beverages')
  })

  it('sets type to MANUAL', () => {
    const result = transformCollection(makeRaw())
    expect(result.type).toBe('MANUAL')
  })

  it('maps created_at to both updatedAt and publishedAt', () => {
    const result = transformCollection(makeRaw())
    expect(result.updatedAt).toBe('2024-01-15T09:30:00Z')
    expect(result.publishedAt).toBe('2024-01-15T09:30:00Z')
  })

  it('omits updatedAt/publishedAt when created_at is absent', () => {
    const result = transformCollection(makeRaw({ created_at: undefined }))
    expect(result.updatedAt).toBeUndefined()
    expect(result.publishedAt).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeRaw()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    const result = transformCollection(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output with minimal input', () => {
    const result = transformCollection(makeRaw({ color: undefined, created_at: undefined }))
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (Loyverse)', () => {
  it('maps title to name', () => {
    const result = untransformCollection({ title: 'Beverages' })
    expect(result.name).toBe('Beverages')
  })
})
