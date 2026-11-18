import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWooCommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/vnda/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawWooCommerceCategory> = {}): RawWooCommerceCategory {
  return {
    id: 10,
    name: 'Electronics',
    slug: 'electronics',
    description: 'Electronic gadgets',
    image: { id: 1, src: 'https://example.com/img.jpg', alt: 'Electronics' },
    ...overrides,
  }
}

describe('transformCollection (VNDA/WooCommerce)', () => {
  it('maps id, title and handle', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('10')
    expect(result.title).toBe('Electronics')
    expect(result.handle).toBe('electronics')
  })

  it('maps description', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('Electronic gadgets')
  })

  it('always sets type to MANUAL', () => {
    expect(transformCollection(makeCategory()).type).toBe('MANUAL')
  })

  it('sets productIds to empty array', () => {
    expect(transformCollection(makeCategory()).productIds).toEqual([])
  })

  it('maps image', () => {
    const result = transformCollection(makeCategory())
    expect(result.image!.url).toBe('https://example.com/img.jpg')
    expect(result.image!.alt).toBe('Electronics')
  })

  it('omits image when not present', () => {
    const result = transformCollection(makeCategory({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips title and handle via untransformCollection', () => {
    const collection = transformCollection(makeCategory())
    const body = untransformCollection(collection)
    expect(body['name']).toBe('Electronics')
    expect(body['slug']).toBe('electronics')
  })
})
