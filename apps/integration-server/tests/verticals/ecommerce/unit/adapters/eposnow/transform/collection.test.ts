import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawEposNowCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/eposnow/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawEposNowCategory> = {}): RawEposNowCategory {
  return {
    Id: 100,
    Name: 'Hot Drinks',
    ParentId: null,
    ...overrides,
  }
}

describe('transformCollection (Epos Now)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('100')
    expect(result.title).toBe('Hot Drinks')
    expect(result.type).toBe('MANUAL')
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

  it('handles missing name gracefully', () => {
    const result = transformCollection(makeCategory({ Name: undefined }))
    expect(result.title).toBe('')
  })
})

describe('untransformCollection (Epos Now)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical)
    expect(raw['Name']).toBe('Hot Drinks')
  })
})
