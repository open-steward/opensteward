import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawShopifyCollection> = {}): RawShopifyCollection {
  return {
    id: 701,
    title: 'Coleção Verão',
    handle: 'colecao-verao',
    body_html: '<p>Peças leves e coloridas para o verão.</p>',
    published_at: '2024-01-10T08:00:00Z',
    updated_at: '2024-02-15T10:00:00Z',
    image: {
      src: 'https://cdn.exemplo.com.br/colecao-verao.jpg',
      alt: 'Coleção Verão',
      width: 1200,
      height: 600,
    },
    ...overrides,
  }
}

describe('transformCollection (loja-integrada / Shopify)', () => {
  it('maps id, title, handle, and description', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('701')
    expect(result.title).toBe('Coleção Verão')
    expect(result.handle).toBe('colecao-verao')
    expect(result.description).toBe('<p>Peças leves e coloridas para o verão.</p>')
  })

  it('defaults type to MANUAL when not provided', () => {
    const result = transformCollection(makeRaw())
    expect(result.type).toBe('MANUAL')
  })

  it('accepts SMART type', () => {
    const result = transformCollection(makeRaw(), 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('maps image', () => {
    const result = transformCollection(makeRaw())
    expect(result.image).toMatchObject({
      url: 'https://cdn.exemplo.com.br/colecao-verao.jpg',
      alt: 'Coleção Verão',
      width: 1200,
      height: 600,
    })
  })

  it('maps updatedAt and publishedAt', () => {
    const result = transformCollection(makeRaw())
    expect(result.updatedAt).toBe('2024-02-15T10:00:00Z')
    expect(result.publishedAt).toBe('2024-01-10T08:00:00Z')
  })

  it('sets image to undefined when image has no src', () => {
    const result = transformCollection(makeRaw({ image: { src: undefined, alt: 'no src' } }))
    expect(result.image).toBeUndefined()
  })

  it('sets image to undefined when image is null', () => {
    const result = transformCollection(makeRaw({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('sets publishedAt to undefined when published_at is null', () => {
    const result = transformCollection(makeRaw({ published_at: null }))
    expect(result.publishedAt).toBeUndefined()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (loja-integrada / Shopify)', () => {
  it('maps canonical fields back to Shopify body keys', () => {
    const result = untransformCollection({
      title: 'Coleção Verão',
      handle: 'colecao-verao',
      description: '<p>Verão tropical.</p>',
      publishedAt: '2024-01-10T08:00:00Z',
      image: { url: 'https://cdn.exemplo.com.br/verao.jpg', alt: 'Verão' },
    })
    expect(result.title).toBe('Coleção Verão')
    expect(result.handle).toBe('colecao-verao')
    expect(result.body_html).toBe('<p>Verão tropical.</p>')
    expect(result.published_at).toBe('2024-01-10T08:00:00Z')
    expect(result.image).toMatchObject({
      src: 'https://cdn.exemplo.com.br/verao.jpg',
      alt: 'Verão',
    })
  })
})
