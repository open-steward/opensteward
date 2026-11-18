import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawShopgateCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopgate/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawShopgateCategory> = {}): RawShopgateCategory {
  return {
    code: 'cat-electronics',
    name: 'Electronics',
    description: 'All electronic products',
    url: 'https://shop.example.com/electronics',
    image: {
      url: 'https://cdn.example.com/electronics.jpg',
      altText: 'Electronics category',
    },
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-05-10T12:00:00.000Z',
    ...overrides,
  }
}

describe('shopgate transformCollection', () => {
  it('uses code as id', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('cat-electronics')
  })

  it('maps name to title', () => {
    const result = transformCollection(makeRaw())
    expect(result.title).toBe('Electronics')
  })

  it('maps description', () => {
    const result = transformCollection(makeRaw())
    expect(result.description).toBe('All electronic products')
  })

  it('type is always MANUAL for Shopgate categories', () => {
    const result = transformCollection(makeRaw())
    expect(result.type).toBe('MANUAL')
  })

  it('maps image url and altText', () => {
    const result = transformCollection(makeRaw())
    expect(result.image?.url).toBe('https://cdn.example.com/electronics.jpg')
    expect(result.image?.alt).toBe('Electronics category')
  })

  it('maps updatedAt', () => {
    const result = transformCollection(makeRaw())
    expect(result.updatedAt).toBe('2024-05-10T12:00:00.000Z')
  })

  it('produces output that passes CollectionSchema', () => {
    const result = transformCollection(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeRaw())
    const back = untransformCollection(canonical)
    expect(back.code).toBe('cat-electronics')
    expect(back.name).toBe('Electronics')
  })
})
