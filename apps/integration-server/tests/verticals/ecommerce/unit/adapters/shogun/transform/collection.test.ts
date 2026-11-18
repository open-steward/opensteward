import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/shogun/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCollection(overrides: Partial<RawShopifyCollection> = {}): RawShopifyCollection {
  return {
    id: 10,
    title: 'Accessories',
    handle: 'accessories',
    body_html: '<p>Keyboards, mice, and other desk accessories.</p>',
    published_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    image: {
      src: 'https://cdn.example.com/accessories.jpg',
      alt: 'Accessories',
      width: 800,
      height: 600,
    },
    ...overrides,
  }
}

// ── transformCollection ───────────────────────────────────────────────────────

describe('transformCollection (Shogun)', () => {
  it('maps id as string', () => {
    const result = transformCollection(makeCollection())
    expect(result.id).toBe('10')
  })

  it('maps title and handle', () => {
    const result = transformCollection(makeCollection())
    expect(result.title).toBe('Accessories')
    expect(result.handle).toBe('accessories')
  })

  it('maps description from body_html', () => {
    const result = transformCollection(makeCollection())
    expect(result.description).toBe('<p>Keyboards, mice, and other desk accessories.</p>')
  })

  it('defaults type to MANUAL when not specified', () => {
    const result = transformCollection(makeCollection())
    expect(result.type).toBe('MANUAL')
  })

  it('accepts SMART type override', () => {
    const result = transformCollection(makeCollection(), 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('maps image url and alt', () => {
    const result = transformCollection(makeCollection())
    expect(result.image).toMatchObject({
      url: 'https://cdn.example.com/accessories.jpg',
      alt: 'Accessories',
      width: 800,
      height: 600,
    })
  })

  it('maps updatedAt and publishedAt', () => {
    const result = transformCollection(makeCollection())
    expect(result.updatedAt).toBe('2026-02-01T14:20:00.000Z')
    expect(result.publishedAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('handles missing image gracefully', () => {
    const result = transformCollection(makeCollection({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCollection()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCollection())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

// ── untransformCollection ─────────────────────────────────────────────────────

describe('untransformCollection (Shogun)', () => {
  it('maps title and handle', () => {
    const body = untransformCollection({ title: 'Accessories', handle: 'accessories' })
    expect(body['title']).toBe('Accessories')
    expect(body['handle']).toBe('accessories')
  })

  it('maps description to body_html', () => {
    const body = untransformCollection({ description: '<p>Nice stuff</p>' })
    expect(body['body_html']).toBe('<p>Nice stuff</p>')
  })

  it('maps image url to src', () => {
    const body = untransformCollection({ image: { url: 'https://cdn.example.com/img.jpg', alt: 'Test' } })
    expect((body['image'] as Record<string, unknown>)['src']).toBe('https://cdn.example.com/img.jpg')
  })
})
