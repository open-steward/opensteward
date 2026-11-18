import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawVendureCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/vendure/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawVendureCollection> = {}): RawVendureCollection {
  return {
    id: '5',
    name: 'Summer Sale',
    slug: 'summer-sale',
    description: 'Hot deals for summer',
    featuredAsset: { id: 'A1', preview: 'https://vendure.io/img/sale.jpg', name: 'Summer' },
    productVariants: {
      items: [
        { product: { id: 'P1' } },
        { product: { id: 'P2' } },
        { product: { id: 'P1' } }, // duplicate
      ],
      totalItems: 3,
    },
    filters: [],
    createdAt: '2024-01-10T12:00:00Z',
    updatedAt: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (Vendure)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCollection())
    expect(result.id).toBe('5')
    expect(result.title).toBe('Summer Sale')
    expect(result.handle).toBe('summer-sale')
    expect(result.description).toBe('Hot deals for summer')
    expect(result.type).toBe('MANUAL')
  })

  it('maps to SMART type when filters are present', () => {
    const result = transformCollection(makeCollection({
      filters: [{ code: 'facet-value-filter', args: [] }],
    }))
    expect(result.type).toBe('SMART')
  })

  it('deduplicates product ids', () => {
    const result = transformCollection(makeCollection())
    expect(result.productIds).toEqual(['P1', 'P2'])
  })

  it('maps featured asset to image', () => {
    const result = transformCollection(makeCollection())
    expect(result.image?.url).toBe('https://vendure.io/img/sale.jpg')
    expect(result.image?.alt).toBe('Summer')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCollection()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCollection())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeCollection())
    const raw = untransformCollection(canonical)
    expect(raw['name']).toBe('Summer Sale')
    expect(raw['slug']).toBe('summer-sale')
  })
})
