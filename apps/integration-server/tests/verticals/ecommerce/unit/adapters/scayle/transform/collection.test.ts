import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawScayleShopCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/scayle/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawScayleShopCategory> = {}): RawScayleShopCategory {
  return {
    id: 42,
    key: 'mens-jackets',
    name: { de: 'Herrenjacken', en: 'Men Jackets' },
    isHidden: false,
    parentId: null,
    updatedAt: '2024-05-15T10:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (SCAYLE)', () => {
  it('stringifies numeric id', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
  })

  it('prefers de locale for title', () => {
    const result = transformCollection(makeCategory())
    expect(result.title).toBe('Herrenjacken')
  })

  it('falls back to en locale when de is absent', () => {
    const result = transformCollection(makeCategory({ name: { en: 'Men Jackets' } }))
    expect(result.title).toBe('Men Jackets')
  })

  it('handles string name directly', () => {
    const result = transformCollection(makeCategory({ name: 'All Products' }))
    expect(result.title).toBe('All Products')
  })

  it('maps key → handle', () => {
    const result = transformCollection(makeCategory())
    expect(result.handle).toBe('mens-jackets')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('maps updatedAt', () => {
    const result = transformCollection(makeCategory())
    expect(result.updatedAt).toBe('2024-05-15T10:00:00Z')
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

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical)
    expect(raw.key).toBe('mens-jackets')
    // untransform writes title into both de and en keys
    expect((raw.name as Record<string, string>).de).toBe('Herrenjacken')
  })
})
