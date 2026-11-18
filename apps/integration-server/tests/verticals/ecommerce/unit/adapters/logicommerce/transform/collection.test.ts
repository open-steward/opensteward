import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawShopifyCollection> = {}): RawShopifyCollection {
  return {
    id: 123,
    title: 'Summer Collection',
    handle: 'summer-collection',
    body_html: '<p>Hot picks</p>',
    published_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    image: { src: 'https://cdn.example.com/summer.jpg', alt: 'Summer banner' },
    ...overrides,
  }
}

describe('transformCollection (logicommerce / Shopify)', () => {
  it('maps id to string', () => {
    const result = transformCollection(makeCollection({ id: 77 }))
    expect(result.id).toBe('77')
  })

  it('maps title', () => {
    const result = transformCollection(makeCollection())
    expect(result.title).toBe('Summer Collection')
  })

  it('maps body_html to description', () => {
    const result = transformCollection(makeCollection())
    expect(result.description).toBe('<p>Hot picks</p>')
  })

  it('defaults type to MANUAL', () => {
    const result = transformCollection(makeCollection())
    expect(result.type).toBe('MANUAL')
  })

  it('accepts SMART type override', () => {
    const result = transformCollection(makeCollection(), 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('maps image.src to image.url', () => {
    const result = transformCollection(makeCollection())
    expect(result.image?.url).toBe('https://cdn.example.com/summer.jpg')
  })

  it('sets image to undefined when image is null', () => {
    const result = transformCollection(makeCollection({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('stores raw payload in metadata', () => {
    const raw = makeCollection()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCollection())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (logicommerce / Shopify)', () => {
  it('maps title', () => {
    const body = untransformCollection({ title: 'Winter Sale' })
    expect(body.title).toBe('Winter Sale')
  })

  it('maps description to body_html', () => {
    const body = untransformCollection({ description: '<p>Great deals</p>' })
    expect(body.body_html).toBe('<p>Great deals</p>')
  })

  it('round-trips core fields', () => {
    const canonical = transformCollection(makeCollection())
    const body = untransformCollection(canonical)
    expect(body.title).toBe('Summer Collection')
    expect(body.handle).toBe('summer-collection')
  })
})
