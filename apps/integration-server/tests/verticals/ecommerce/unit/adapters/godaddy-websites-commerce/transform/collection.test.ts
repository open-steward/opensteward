import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawShopifyCollection> = {}): RawShopifyCollection {
  return {
    id: 200,
    title: 'Summer Arrivals',
    handle: 'summer-arrivals',
    body_html: '<p>Fresh summer styles</p>',
    published_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-10T00:00:00Z',
    image: {
      src: 'https://cdn.example.com/summer.jpg',
      alt: 'Summer collection',
      width: 800,
      height: 600,
    },
    ...overrides,
  }
}

describe('transformCollection (GoDaddy Websites + Commerce / Shopify shapes)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCollection(makeCollection())
    expect(result.id).toBe('200')
    expect(result.title).toBe('Summer Arrivals')
    expect(result.handle).toBe('summer-arrivals')
    expect(result.description).toBe('<p>Fresh summer styles</p>')
  })

  it('defaults type to MANUAL', () => {
    const result = transformCollection(makeCollection())
    expect(result.type).toBe('MANUAL')
  })

  it('accepts SMART type override', () => {
    const result = transformCollection(makeCollection(), 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('maps image with width/height', () => {
    const result = transformCollection(makeCollection())
    expect(result.image?.url).toBe('https://cdn.example.com/summer.jpg')
    expect(result.image?.width).toBe(800)
    expect(result.image?.height).toBe(600)
  })

  it('returns undefined image when src is absent', () => {
    const result = transformCollection(makeCollection({ image: { src: undefined } }))
    expect(result.image).toBeUndefined()
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
    const back = untransformCollection(canonical)
    expect(back.title).toBe('Summer Arrivals')
    expect(back.body_html).toBe('<p>Fresh summer styles</p>')
  })
})
