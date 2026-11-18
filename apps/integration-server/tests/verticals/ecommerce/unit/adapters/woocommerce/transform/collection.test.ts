import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWooCommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/woocommerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(
  overrides: Partial<RawWooCommerceCategory> = {},
): RawWooCommerceCategory {
  return {
    id: 42,
    name: 'Summer Sale',
    slug: 'summer-sale',
    parent: 0,
    description: 'Hot deals',
    display: 'default',
    image: {
      id: 100,
      src: 'https://cdn.example.com/img/sale.jpg',
      alt: 'Summer Sale',
    },
    menu_order: 1,
    count: 12,
    ...overrides,
  }
}

describe('transformCollection (WooCommerce)', () => {
  it('maps core fields and always sets MANUAL type', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Summer Sale')
    expect(result.handle).toBe('summer-sale')
    expect(result.description).toBe('Hot deals')
    expect(result.type).toBe('MANUAL')
    expect(result.image?.url).toBe('https://cdn.example.com/img/sale.jpg')
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
    expect(body['name']).toBe('Summer Sale')
    expect(body['slug']).toBe('summer-sale')
    expect(body['description']).toBe('Hot deals')
  })
})
