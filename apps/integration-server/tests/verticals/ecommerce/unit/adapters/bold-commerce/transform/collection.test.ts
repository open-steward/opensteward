import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

describe('transformCollection (bold-commerce)', () => {
  const raw: RawShopifyCollection = {
    id: 42,
    title: 'Summer Sale',
    handle: 'summer-sale',
    body_html: '<p>All summer items</p>',
    published_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    image: {
      src: 'https://example.com/img.jpg',
      alt: 'Summer banner',
      width: 800,
      height: 600,
    },
  }

  it('maps id to string', () => {
    const result = transformCollection(raw)
    expect(result.id).toBe('42')
  })

  it('maps title correctly', () => {
    const result = transformCollection(raw)
    expect(result.title).toBe('Summer Sale')
  })

  it('maps handle correctly', () => {
    const result = transformCollection(raw)
    expect(result.handle).toBe('summer-sale')
  })

  it('maps description from body_html', () => {
    const result = transformCollection(raw)
    expect(result.description).toBe('<p>All summer items</p>')
  })

  it('defaults type to MANUAL', () => {
    const result = transformCollection(raw)
    expect(result.type).toBe('MANUAL')
  })

  it('accepts SMART type override', () => {
    const result = transformCollection(raw, 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('maps image fields', () => {
    const result = transformCollection(raw)
    expect(result.image?.url).toBe('https://example.com/img.jpg')
    expect(result.image?.alt).toBe('Summer banner')
    expect(result.image?.width).toBe(800)
    expect(result.image?.height).toBe(600)
  })

  it('passes CollectionSchema validation', () => {
    const result = transformCollection(raw)
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('handles null image gracefully', () => {
    const noImg: RawShopifyCollection = { ...raw, image: null }
    const result = transformCollection(noImg)
    expect(result.image).toBeUndefined()
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('handles null body_html', () => {
    const noDesc: RawShopifyCollection = { ...raw, body_html: null }
    const result = transformCollection(noDesc)
    expect(result.description).toBeUndefined()
  })
})

describe('untransformCollection (bold-commerce)', () => {
  it('round-trips title and handle', () => {
    const raw: RawShopifyCollection = {
      id: 1,
      title: 'My Collection',
      handle: 'my-collection',
    }
    const canonical = transformCollection(raw)
    const body = untransformCollection(canonical)
    expect(body.title).toBe('My Collection')
    expect(body.handle).toBe('my-collection')
  })

  it('includes body_html from description', () => {
    const raw: RawShopifyCollection = {
      id: 2,
      title: 'Desc',
      body_html: '<b>Bold</b>',
    }
    const canonical = transformCollection(raw)
    const body = untransformCollection(canonical)
    expect(body.body_html).toBe('<b>Bold</b>')
  })
})
