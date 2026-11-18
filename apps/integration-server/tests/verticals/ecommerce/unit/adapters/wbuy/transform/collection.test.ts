import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWooCommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/wbuy/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(
  overrides: Partial<RawWooCommerceCategory> = {},
): RawWooCommerceCategory {
  return {
    id: 101,
    name: 'Electronics',
    slug: 'electronics',
    parent: 0,
    description: 'All electronics',
    display: 'default',
    image: {
      id: 10,
      src: 'https://cdn.example.com/img/electronics.jpg',
      alt: 'Electronics',
    },
    menu_order: 1,
    count: 20,
    ...overrides,
  }
}

describe('transformCollection (wbuy)', () => {
  it('maps core fields and always sets MANUAL type', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.id).toBe('101')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Electronics')
    expect(result.handle).toBe('electronics')
    expect(result.description).toBe('All electronics')
    expect(result.type).toBe('MANUAL')
    expect(result.image?.url).toBe('https://cdn.example.com/img/electronics.jpg')
    // WC categories don't inline their member products.
    expect(result.productIds).toEqual([])
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

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const body = untransformCollection(canonical)
    expect(body['name']).toBe('Electronics')
    expect(body['slug']).toBe('electronics')
    expect(body['description']).toBe('All electronics')
  })
})
