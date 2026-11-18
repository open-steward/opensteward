import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopaccino/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawShopifyCollection> = {}): RawShopifyCollection {
  return {
    id: 99001,
    title: 'Best Sellers',
    handle: 'best-sellers',
    body_html: '<p>Top products</p>',
    published_at: '2024-01-10T00:00:00.000Z',
    updated_at: '2024-03-15T08:30:00.000Z',
    image: {
      src: 'https://cdn.shopaccino.com/img/best-sellers.jpg',
      alt: 'Best Sellers',
      width: 600,
      height: 300,
    },
    ...overrides,
  }
}

describe('shopaccino transformCollection', () => {
  it('maps id to string and title correctly', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('99001')
    expect(result.title).toBe('Best Sellers')
  })

  it('maps handle and description from body_html', () => {
    const result = transformCollection(makeRaw())
    expect(result.handle).toBe('best-sellers')
    expect(result.description).toBe('<p>Top products</p>')
  })

  it('defaults type to MANUAL when not provided', () => {
    const result = transformCollection(makeRaw())
    expect(result.type).toBe('MANUAL')
  })

  it('uses the type parameter when provided', () => {
    const result = transformCollection(makeRaw(), 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('maps image fields correctly', () => {
    const result = transformCollection(makeRaw())
    expect(result.image?.url).toBe('https://cdn.shopaccino.com/img/best-sellers.jpg')
    expect(result.image?.alt).toBe('Best Sellers')
    expect(result.image?.width).toBe(600)
    expect(result.image?.height).toBe(300)
  })

  it('produces output that passes CollectionSchema', () => {
    const result = transformCollection(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeRaw())
    const back = untransformCollection(canonical)
    expect(back.title).toBe('Best Sellers')
    expect(back.handle).toBe('best-sellers')
    expect(back.body_html).toBe('<p>Top products</p>')
  })
})
