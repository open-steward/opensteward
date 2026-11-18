import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawSaleorCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/saleor/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawSaleorCollection> = {}): RawSaleorCollection {
  return {
    id: 'Q29sbGVjdGlvbjox',
    name: 'Summer Sale',
    slug: 'summer-sale',
    description: 'Hot deals for summer',
    backgroundImage: { url: 'https://saleor.io/img/sale.jpg', alt: 'Summer' },
    products: {
      edges: [{ node: { id: 'P1' } }, { node: { id: 'P2' } }],
    },
    ...overrides,
  }
}

describe('transformCollection (Saleor)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCollection())
    expect(result.id).toBe('Q29sbGVjdGlvbjox')
    expect(result.title).toBe('Summer Sale')
    expect(result.handle).toBe('summer-sale')
    expect(result.description).toBe('Hot deals for summer')
    expect(result.type).toBe('MANUAL')
  })

  it('maps product ids', () => {
    const result = transformCollection(makeCollection())
    expect(result.productIds).toEqual(['P1', 'P2'])
  })

  it('maps background image', () => {
    const result = transformCollection(makeCollection())
    expect(result.image?.url).toBe('https://saleor.io/img/sale.jpg')
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
