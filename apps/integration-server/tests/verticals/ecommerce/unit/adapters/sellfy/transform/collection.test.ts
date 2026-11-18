import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/sellfy/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawShopifyCollection> = {}): RawShopifyCollection {
  return {
    id: 789,
    title: 'My Collection',
    handle: 'my-collection',
    body_html: '<p>A curated set of products.</p>',
    published_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-02-20T08:00:00Z',
    image: {
      src: 'https://cdn.sellfy.com/img/collection.jpg',
      alt: 'Collection banner',
      width: 1200,
      height: 400,
    },
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformCollection(makeCollection())
    expect(result.id).toBe('789')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('My Collection')
  })

  it('maps handle and description', () => {
    const result = transformCollection(makeCollection())
    expect(result.handle).toBe('my-collection')
    expect(result.description).toBe('<p>A curated set of products.</p>')
  })

  it('defaults type to MANUAL when not provided', () => {
    const result = transformCollection(makeCollection())
    expect(result.type).toBe('MANUAL')
  })

  it('accepts SMART as the collection type', () => {
    const result = transformCollection(makeCollection(), 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('maps image with url, alt, and dimensions', () => {
    const result = transformCollection(makeCollection())
    expect(result.image?.url).toBe('https://cdn.sellfy.com/img/collection.jpg')
    expect(result.image?.alt).toBe('Collection banner')
    expect(result.image?.width).toBe(1200)
    expect(result.image?.height).toBe(400)
  })

  it('maps dates', () => {
    const result = transformCollection(makeCollection())
    expect(result.updatedAt).toBe('2024-02-20T08:00:00Z')
    expect(result.publishedAt).toBe('2024-01-10T00:00:00Z')
  })

  it('omits image when raw has no image', () => {
    const result = transformCollection(makeCollection({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCollection()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema (MANUAL)', () => {
    const result = transformCollection(makeCollection(), 'MANUAL')
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('produces a payload that satisfies CollectionSchema (SMART)', () => {
    const result = transformCollection(makeCollection(), 'SMART')
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeCollection())
    const raw = untransformCollection(canonical)
    expect(raw.title).toBe('My Collection')
    expect(raw.handle).toBe('my-collection')
    expect(raw.body_html).toBe('<p>A curated set of products.</p>')
  })
})
