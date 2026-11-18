import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShoplineCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopline/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawShoplineCollection> = {}): RawShoplineCollection {
  return {
    id: 301,
    title: 'Accessories',
    handle: 'accessories',
    body_html: '<p>Keyboards, mice, and other desk accessories.</p>',
    collection_type: 'manual',
    published_at: '2024-01-15T00:00:00.000Z',
    updated_at: '2024-06-01T08:00:00.000Z',
    created_at: '2024-01-01T00:00:00.000Z',
    image: {
      src: 'https://cdn.shopline.com/accessories.jpg',
      alt: 'Accessories collection',
      width: 800,
      height: 600,
    },
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps id and title', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('301')
    expect(result.title).toBe('Accessories')
  })

  it('maps handle, description, and timestamps', () => {
    const result = transformCollection(makeRaw())
    expect(result.handle).toBe('accessories')
    expect(result.description).toBe('<p>Keyboards, mice, and other desk accessories.</p>')
    expect(result.updatedAt).toBe('2024-06-01T08:00:00.000Z')
    expect(result.publishedAt).toBe('2024-01-15T00:00:00.000Z')
  })

  it('maps collection_type: manual → MANUAL', () => {
    const result = transformCollection(makeRaw({ collection_type: 'manual' }))
    expect(result.type).toBe('MANUAL')
  })

  it('maps collection_type: smart → SMART', () => {
    const result = transformCollection(makeRaw({ collection_type: 'smart' }))
    expect(result.type).toBe('SMART')
  })

  it('infers SMART type from non-empty rules array', () => {
    const result = transformCollection(
      makeRaw({
        collection_type: undefined,
        rules: [{ column: 'title', relation: 'contains', condition: 'shirt' }],
      }),
    )
    expect(result.type).toBe('SMART')
  })

  it('respects typeHint over collection_type field', () => {
    const result = transformCollection(makeRaw({ collection_type: 'manual' }), 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('maps image from image field', () => {
    const result = transformCollection(makeRaw())
    expect(result.image?.url).toBe('https://cdn.shopline.com/accessories.jpg')
    expect(result.image?.alt).toBe('Accessories collection')
    expect(result.image?.width).toBe(800)
    expect(result.image?.height).toBe(600)
  })

  it('falls back to banner when image is absent', () => {
    const result = transformCollection(
      makeRaw({
        image: null,
        banner: { src: 'https://cdn.shopline.com/banner.jpg', alt: 'Banner' },
      }),
    )
    expect(result.image?.url).toBe('https://cdn.shopline.com/banner.jpg')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRaw()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies CollectionSchema', () => {
    const result = transformCollection(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeRaw())
    const body = untransformCollection(canonical)
    expect(body.title).toBe('Accessories')
    expect(body.handle).toBe('accessories')
    expect(body.body_html).toBe('<p>Keyboards, mice, and other desk accessories.</p>')
    expect((body.image as Record<string, unknown>)?.src).toBe(
      'https://cdn.shopline.com/accessories.jpg',
    )
  })
})
