import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/weebly/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawShopifyCollection> = {}): RawShopifyCollection {
  return {
    id: 789,
    title: 'Summer Sale',
    handle: 'summer-sale',
    body_html: '<p>Summer items</p>',
    published_at: '2024-05-01T10:00:00.000Z',
    updated_at: '2024-05-01T10:00:00.000Z',
    image: {
      src: 'https://cdn.example.com/img/summer-sale.jpg',
      alt: 'Summer Sale Banner',
      width: 800,
      height: 400,
    },
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps core fields and stringifies id', () => {
    const raw = makeCollection()
    const result = transformCollection(raw)
    expect(result.id).toBe('789')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Summer Sale')
    expect(result.handle).toBe('summer-sale')
    expect(result.description).toBe('<p>Summer items</p>')
    expect(result.image?.url).toBe('https://cdn.example.com/img/summer-sale.jpg')
    expect(result.image?.alt).toBe('Summer Sale Banner')
  })

  it('defaults type to MANUAL when not provided', () => {
    const result = transformCollection(makeCollection())
    expect(result.type).toBe('MANUAL')
  })

  it('respects the type parameter when SMART', () => {
    const result = transformCollection(makeCollection(), 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('returns undefined image when image is absent', () => {
    const result = transformCollection(makeCollection({ image: undefined }))
    expect(result.image).toBeUndefined()
  })

  it('returns undefined image when image has no src', () => {
    const result = transformCollection(makeCollection({ image: { alt: 'no-src' } }))
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
    const raw = untransformCollection(canonical)
    expect(raw.title).toBe('Summer Sale')
    expect(raw.handle).toBe('summer-sale')
    expect(raw.body_html).toBe('<p>Summer items</p>')
    expect((raw.image as { src: string } | undefined)?.src).toBe(
      'https://cdn.example.com/img/summer-sale.jpg',
    )
  })
})
