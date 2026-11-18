/**
 * Virto Commerce Category → canonical Collection.
 *
 * Field shapes verified against the live demo instance's
 * VirtoCommerce.Catalog/swagger.json `components.schemas.Category`
 * (fetched 2026-09-13): id, catalogId, parentId, code, name, isVirtual,
 * isActive, images[], imgSrc, seoInfos[], createdDate, modifiedDate.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawVirtoCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/virto-commerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawVirtoCategory> = {}): RawVirtoCategory {
  return {
    id: 'cat-1',
    catalogId: 'catalog-1',
    code: 'ACCESSORIES',
    name: 'Accessories',
    isVirtual: false,
    isActive: true,
    modifiedDate: '2026-02-01T14:20:00Z',
    createdDate: '2026-01-15T09:30:00Z',
    ...overrides,
  }
}

describe('transformCollection (virto-commerce)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('cat-1')
    expect(result.title).toBe('Accessories')
  })

  it('maps a non-virtual category to MANUAL and a virtual one to SMART', () => {
    expect(transformCollection(makeCategory({ isVirtual: false })).type).toBe('MANUAL')
    expect(transformCollection(makeCategory({ isVirtual: true })).type).toBe('SMART')
  })

  it('maps the first image, preferring images[] over imgSrc', () => {
    const result = transformCollection(
      makeCategory({ imgSrc: 'https://cdn.example.com/fallback.jpg', images: [{ url: 'https://cdn.example.com/main.jpg' }] }),
    )
    expect(result.image?.url).toBe('https://cdn.example.com/main.jpg')
  })

  it('falls back to imgSrc when images[] is absent', () => {
    const result = transformCollection(makeCategory({ imgSrc: 'https://cdn.example.com/fallback.jpg' }))
    expect(result.image?.url).toBe('https://cdn.example.com/fallback.jpg')
  })

  it('maps updatedAt from modifiedDate', () => {
    expect(transformCollection(makeCategory()).updatedAt).toBe('2026-02-01T14:20:00Z')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeCategory()
    expect(transformCollection(raw).metadata).toEqual(raw)
  })

  it('satisfies CollectionSchema', () => {
    expect(() => CollectionSchema.parse(transformCollection(makeCategory()))).not.toThrow()
  })

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical)
    expect(raw['name']).toBe('Accessories')
  })
})
