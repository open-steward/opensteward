// Nacelle Content Collection data model (shared shape with ProductCollection —
// see the file header in transform/collection.ts for the doc citation and
// caveat): https://docs.nacelle.com/docs/content-data-model
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  type RawNacelleCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/nacelle/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawNacelleCollection> = {}): RawNacelleCollection {
  return {
    nacelleEntryId: 'col_accessories',
    sourceEntryId: '99887766',
    sourceId: 'shopify-src-1',
    tags: ['featured'],
    createdAt: 1709251200,
    updatedAt: 1710028800,
    content: [
      {
        title: 'Accessories',
        description: 'Keyboards, mice, and other desk accessories.',
        handle: 'accessories',
        locale: 'en-US',
        featuredMedia: { id: 'img_hero', url: 'https://cdn.example.com/accessories.jpg' },
      },
    ],
    ...overrides,
  }
}

describe('transformCollection (Nacelle Storefront GraphQL)', () => {
  it('passes the canonical schema', () => {
    const result = transformCollection(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('maps nacelleEntryId to canonical id', () => {
    expect(transformCollection(makeRaw()).id).toBe('col_accessories')
  })

  it('takes title/handle/description from the content entry', () => {
    const result = transformCollection(makeRaw())
    expect(result.title).toBe('Accessories')
    expect(result.handle).toBe('accessories')
    expect(result.description).toBe('Keyboards, mice, and other desk accessories.')
  })

  it('maps featuredMedia to the canonical image', () => {
    const result = transformCollection(makeRaw())
    expect(result.image).toEqual({
      id: 'img_hero',
      url: 'https://cdn.example.com/accessories.jpg',
      alt: undefined,
    })
  })

  it('converts updatedAt from Unix seconds to ISO 8601', () => {
    expect(transformCollection(makeRaw()).updatedAt).toBe('2024-03-10T00:00:00.000Z')
  })

  it('leaves type unset — no manual/smart distinction is documented for Nacelle', () => {
    expect(transformCollection(makeRaw()).type).toBeUndefined()
  })

  it('preserves the raw entry as metadata', () => {
    const raw = makeRaw()
    expect(transformCollection(raw).metadata).toEqual(raw)
  })

  it('throws rather than inventing an empty title when no content entry exists', () => {
    expect(() => transformCollection(makeRaw({ content: [] }))).toThrow(/no content title/)
  })
})
