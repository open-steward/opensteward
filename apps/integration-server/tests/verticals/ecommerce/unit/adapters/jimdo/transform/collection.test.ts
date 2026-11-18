import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/jimdo/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

describe('transformCollection (jimdo)', () => {
  const raw: RawShopifyCollection = {
    id: 123456,
    title: 'Summer Essentials',
    handle: 'summer-essentials',
    body_html: '<p>Top summer picks.</p>',
    published_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    image: {
      src: 'https://cdn.example.com/summer.jpg',
      alt: 'Summer banner',
      width: 800,
      height: 400,
    },
  }

  it('maps id to string', () => {
    const result = transformCollection(raw)
    expect(result.id).toBe('123456')
  })

  it('maps title correctly', () => {
    const result = transformCollection(raw)
    expect(result.title).toBe('Summer Essentials')
  })

  it('maps handle', () => {
    const result = transformCollection(raw)
    expect(result.handle).toBe('summer-essentials')
  })

  it('maps description from body_html', () => {
    const result = transformCollection(raw)
    expect(result.description).toBe('<p>Top summer picks.</p>')
  })

  it('defaults type to MANUAL', () => {
    const result = transformCollection(raw)
    expect(result.type).toBe('MANUAL')
  })

  it('accepts SMART type override', () => {
    const result = transformCollection(raw, 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('maps image src to url', () => {
    const result = transformCollection(raw)
    expect(result.image?.url).toBe('https://cdn.example.com/summer.jpg')
    expect(result.image?.alt).toBe('Summer banner')
    expect(result.image?.width).toBe(800)
    expect(result.image?.height).toBe(400)
  })

  it('produces schema-valid output', () => {
    const result = transformCollection(raw)
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('handles missing image gracefully', () => {
    const result = transformCollection({ id: 1, title: 'No Image', image: null })
    expect(result.image).toBeUndefined()
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const result = transformCollection(raw)
    const back = untransformCollection(result)
    expect(back.title).toBe(raw.title)
    expect(back.handle).toBe(raw.handle)
    expect(back.body_html).toBe(raw.body_html)
  })
})
