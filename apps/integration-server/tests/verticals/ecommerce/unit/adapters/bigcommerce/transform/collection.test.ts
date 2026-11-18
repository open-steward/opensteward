import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawBigCommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcommerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawBigCommerceCategory> = {}): RawBigCommerceCategory {
  return {
    id: 5,
    name: 'Summer Sale',
    description: '<p>Hot deals for summer</p>',
    parent_id: 0,
    sort_order: 1,
    is_visible: true,
    custom_url: { url: '/summer-sale/' },
    image_url: 'https://cdn.bigcommerce.com/img/sale.jpg',
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps core fields for categories', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.id).toBe('5')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Summer Sale')
    expect(result.handle).toBe('summer-sale')
    expect(result.description).toBe('<p>Hot deals for summer</p>')
    expect(result.type).toBe('MANUAL')
  })

  it('maps the image url', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.bigcommerce.com/img/sale.jpg')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical)
    expect(raw.name).toBe('Summer Sale')
    expect(raw.description).toBe('<p>Hot deals for summer</p>')
  })
})
