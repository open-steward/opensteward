import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWooCommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/fnac-marketplace/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawWooCommerceCategory> = {}): RawWooCommerceCategory {
  return {
    id: 401,
    name: 'Films & Séries',
    slug: 'films-series',
    description: 'Tous vos films et séries préférés',
    image: {
      id: 501,
      src: 'https://cdn.fnac.com/films.jpg',
      alt: 'Films',
    },
    count: 100,
    ...overrides,
  }
}

describe('transformCollection (FNAC/WooCommerce)', () => {
  it('maps id and title', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('401')
    expect(result.title).toBe('Films & Séries')
  })

  it('maps handle from slug', () => {
    const result = transformCollection(makeRaw())
    expect(result.handle).toBe('films-series')
  })

  it('maps description', () => {
    const result = transformCollection(makeRaw())
    expect(result.description).toBe('Tous vos films et séries préférés')
  })

  it('hardcodes type as MANUAL', () => {
    const result = transformCollection(makeRaw())
    expect(result.type).toBe('MANUAL')
  })

  it('sets productIds to empty array', () => {
    const result = transformCollection(makeRaw())
    expect(result.productIds).toEqual([])
  })

  it('maps image', () => {
    const result = transformCollection(makeRaw())
    expect(result.image!.url).toBe('https://cdn.fnac.com/films.jpg')
    expect(result.image!.alt).toBe('Films')
  })

  it('round-trips via untransformCollection', () => {
    const result = transformCollection(makeRaw())
    const body = untransformCollection(result)
    expect(body.name).toBe('Films & Séries')
    expect(body.slug).toBe('films-series')
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})
