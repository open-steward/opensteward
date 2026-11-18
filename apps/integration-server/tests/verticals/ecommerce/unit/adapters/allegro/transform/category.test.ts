import { describe, it, expect } from 'vitest'
import {
  transformCategory,
  type RawAllegroCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/allegro/transform/category'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawAllegroCategory> = {}): RawAllegroCategory {
  return {
    id: '261395',
    name: 'Szkatulki i pudelka',
    parent: { id: '261390' },
    leaf: true,
    options: {
      advertisement: false,
      advertisementPriceOptional: false,
      variantsByColorPatternAllowed: true,
      offersWithProductPublicationEnabled: true,
      productCreationEnabled: true,
    },
    ...overrides,
  }
}

describe('transformCategory (Allegro)', () => {
  it('maps core fields from category', () => {
    const result = transformCategory(makeCategory())
    expect(result.id).toBe('261395')
    expect(result.title).toBe('Szkatulki i pudelka')
  })

  it('includes parent info in description', () => {
    const result = transformCategory(makeCategory())
    expect(result.description).toBe('Parent category: 261390')
  })

  it('sets description to undefined when no parent', () => {
    const result = transformCategory(makeCategory({ parent: undefined }))
    expect(result.description).toBeUndefined()
  })

  it('falls back to id for title when name is absent', () => {
    const result = transformCategory(makeCategory({ name: undefined }))
    expect(result.title).toBe('261395')
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCategory(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeCategory()
    const result = transformCategory(raw)
    expect(result.metadata).toBe(raw)
  })
})
