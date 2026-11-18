import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawCloverCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/clover/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawCloverCategory> = {}): RawCloverCategory {
  return {
    id: 'CAT_001',
    name: 'Hot Drinks',
    sortOrder: 1,
    modifiedTime: 1706745600000,
    items: { elements: [{ id: 'ITEM_001' }, { id: 'ITEM_002' }] },
    ...overrides,
  }
}

describe('transformCollection (Clover)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('CAT_001')
    expect(result.title).toBe('Hot Drinks')
    expect(result.type).toBe('MANUAL')
  })

  it('maps product ids from items', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual(['ITEM_001', 'ITEM_002'])
  })

  it('maps timestamp', () => {
    const result = transformCollection(makeCategory())
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('handles missing items gracefully', () => {
    const result = transformCollection(makeCategory({ items: undefined }))
    expect(result.productIds).toBeUndefined()
  })
})

describe('untransformCollection (Clover)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical)
    expect(raw['name']).toBe('Hot Drinks')
  })
})
