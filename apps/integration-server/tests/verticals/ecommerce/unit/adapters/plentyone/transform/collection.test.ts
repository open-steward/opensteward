import { describe, it, expect } from 'vitest'
import {
  transformCategory,
  untransformCategory,
  type RawPlentyOneCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/plentyone/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawPlentyOneCategory> = {}): RawPlentyOneCategory {
  return {
    id: 15,
    parentCategoryId: null,
    level: 1,
    type: 'item',
    updatedAt: '2024-05-01T00:00:00.000Z',
    details: [
      {
        lang: 'en',
        name: 'Electronics',
        description: 'All electronic goods',
      },
      {
        lang: 'de',
        name: 'Elektronik',
        description: 'Alle Elektronikwaren',
      },
    ],
    ...overrides,
  }
}

describe('plentyone transformCategory', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCategory(makeCategory())
    expect(result.id).toBe('15')
    expect(result.title).toBe('Electronics')
    expect(result.description).toBe('All electronic goods')
    expect(result.type).toBe('MANUAL')
  })

  it('prefers the "en" locale detail entry', () => {
    const result = transformCategory(makeCategory())
    expect(result.title).toBe('Electronics')
  })

  it('falls back to first detail when no "en" detail present', () => {
    const result = transformCategory(
      makeCategory({
        details: [{ lang: 'de', name: 'Elektronik', description: 'Alle Elektronikwaren' }],
      }),
    )
    expect(result.title).toBe('Elektronik')
  })

  it('uses id as title when no details provided', () => {
    const result = transformCategory(makeCategory({ details: [] }))
    expect(result.title).toBe('15')
  })

  it('maps updatedAt as ISO datetime', () => {
    const result = transformCategory(makeCategory())
    expect(result.updatedAt).toBe('2024-05-01T00:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCategory(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCategory(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCategory', () => {
    const canonical = transformCategory(makeCategory())
    const raw = untransformCategory(canonical)
    expect(raw.type).toBe('item')
    const details = raw.details as Array<{ lang: string; name: string; description: string }>
    expect(details[0]!.lang).toBe('en')
    expect(details[0]!.name).toBe('Electronics')
  })
})
