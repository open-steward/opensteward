import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShoplazzaCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoplazza/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawShoplazzaCollection> = {}): RawShoplazzaCollection {
  return {
    id: 30001,
    title: 'Summer Picks',
    handle: 'summer-picks',
    description: 'Handpicked summer items',
    collection_type: 'custom',
    published: true,
    published_at: '2024-05-01T00:00:00.000Z',
    updated_at: '2024-05-15T08:00:00.000Z',
    image: {
      src: 'https://cdn.shoplazza.com/summer-picks.jpg',
      alt: 'Summer Picks',
      width: 800,
      height: 400,
    },
    ...overrides,
  }
}

describe('shoplazza transformCollection', () => {
  it('maps id to string', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('30001')
  })

  it('maps title and handle', () => {
    const result = transformCollection(makeRaw())
    expect(result.title).toBe('Summer Picks')
    expect(result.handle).toBe('summer-picks')
  })

  it('maps description (not body_html like Shopify)', () => {
    const result = transformCollection(makeRaw())
    expect(result.description).toBe('Handpicked summer items')
  })

  it('maps collection_type custom → MANUAL', () => {
    const result = transformCollection(makeRaw())
    expect(result.type).toBe('MANUAL')
  })

  it('maps collection_type smart → SMART', () => {
    const result = transformCollection(makeRaw({ collection_type: 'smart' }))
    expect(result.type).toBe('SMART')
  })

  it('maps image fields', () => {
    const result = transformCollection(makeRaw())
    expect(result.image?.url).toBe('https://cdn.shoplazza.com/summer-picks.jpg')
    expect(result.image?.alt).toBe('Summer Picks')
  })

  it('produces output that passes CollectionSchema', () => {
    const result = transformCollection(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeRaw())
    const back = untransformCollection(canonical)
    expect(back.title).toBe('Summer Picks')
    expect(back.handle).toBe('summer-picks')
    expect(back.description).toBe('Handpicked summer items')
  })
})
