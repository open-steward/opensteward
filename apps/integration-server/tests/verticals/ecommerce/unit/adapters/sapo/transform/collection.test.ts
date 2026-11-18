import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawSapoCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/sapo/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawSapoCollection> = {}): RawSapoCollection {
  return {
    id: 99001,
    name: 'Áo Hè',
    alias: 'ao-he',
    description: '<p>Bộ sưu tập mùa hè</p>',
    published_on: '2024-05-01T00:00:00Z',
    modified_on: '2024-06-10T08:00:00Z',
    image: {
      id: 5,
      src: 'https://cdn.sapo.vn/img/ao-he.jpg',
      alt: 'Áo Hè',
      width: 800,
      height: 600,
    },
    ...overrides,
  }
}

describe('transformCollection (Sapo)', () => {
  it('maps name → title and alias → handle', () => {
    const result = transformCollection(makeCollection())
    expect(result.title).toBe('Áo Hè')
    expect(result.handle).toBe('ao-he')
  })

  it('stringifies numeric id', () => {
    const result = transformCollection(makeCollection())
    expect(result.id).toBe('99001')
    expect(typeof result.id).toBe('string')
  })

  it('maps description field directly', () => {
    const result = transformCollection(makeCollection())
    expect(result.description).toBe('<p>Bộ sưu tập mùa hè</p>')
  })

  it('defaults type to MANUAL when not provided', () => {
    const result = transformCollection(makeCollection())
    expect(result.type).toBe('MANUAL')
  })

  it('respects the type parameter', () => {
    const result = transformCollection(makeCollection(), 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('maps modified_on → updatedAt and published_on → publishedAt', () => {
    const result = transformCollection(makeCollection())
    expect(result.updatedAt).toBe('2024-06-10T08:00:00Z')
    expect(result.publishedAt).toBe('2024-05-01T00:00:00Z')
  })

  it('maps image src → url and preserves alt/dimensions', () => {
    const result = transformCollection(makeCollection())
    expect(result.image?.url).toBe('https://cdn.sapo.vn/img/ao-he.jpg')
    expect(result.image?.alt).toBe('Áo Hè')
    expect(result.image?.width).toBe(800)
    expect(result.image?.height).toBe(600)
  })

  it('omits image when src is missing', () => {
    const result = transformCollection(makeCollection({ image: { alt: 'no src' } }))
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
    expect(raw.name).toBe('Áo Hè')
    expect(raw.alias).toBe('ao-he')
    expect(raw.description).toBe('<p>Bộ sưu tập mùa hè</p>')
  })
})
