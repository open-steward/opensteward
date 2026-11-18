import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopify/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawShopifyCollection> = {}): RawShopifyCollection {
  return {
    id: 12345,
    title: 'Summer Sale',
    handle: 'summer-sale',
    body_html: '<p>Hot deals</p>',
    published_at: '2024-06-01T00:00:00Z',
    updated_at: '2024-06-05T12:00:00Z',
    image: {
      src: 'https://cdn.shopify.com/img/sale.jpg',
      alt: 'Summer Sale',
      width: 800,
      height: 400,
    },
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps core fields for manual collections', () => {
    const raw = makeCollection()
    const result = transformCollection(raw, 'MANUAL')
    expect(result.id).toBe('12345')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Summer Sale')
    expect(result.handle).toBe('summer-sale')
    expect(result.description).toBe('<p>Hot deals</p>')
    expect(result.type).toBe('MANUAL')
    expect(result.image?.url).toBe('https://cdn.shopify.com/img/sale.jpg')
  })

  it('respects the type parameter', () => {
    const result = transformCollection(makeCollection(), 'SMART')
    expect(result.type).toBe('SMART')
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
    expect(raw.title).toBe('Summer Sale')
    expect(raw.handle).toBe('summer-sale')
    expect(raw.body_html).toBe('<p>Hot deals</p>')
  })
})
