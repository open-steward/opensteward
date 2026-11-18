import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawMyCashflowCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/mycashflow/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawMyCashflowCategory> = {}): RawMyCashflowCategory {
  return {
    id: 101,
    name: 'Electronics',
    slug: 'electronics',
    description: 'All electronic products',
    parent_id: null,
    image: {
      id: 5,
      url: 'https://example.com/electronics.jpg',
      alt: 'Electronics category',
    },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-10T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (MyCashflow)', () => {
  it('maps id to string canonical id', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('101')
  })

  it('maps name to title', () => {
    const result = transformCollection(makeRaw())
    expect(result.title).toBe('Electronics')
  })

  it('maps slug to handle', () => {
    const result = transformCollection(makeRaw())
    expect(result.handle).toBe('electronics')
  })

  it('always emits type=MANUAL', () => {
    const result = transformCollection(makeRaw())
    expect(result.type).toBe('MANUAL')
  })

  it('maps productIds to empty array', () => {
    const result = transformCollection(makeRaw())
    expect(result.productIds).toEqual([])
  })

  it('maps image url and alt', () => {
    const result = transformCollection(makeRaw())
    expect(result.image).toMatchObject({
      id: '5',
      url: 'https://example.com/electronics.jpg',
      alt: 'Electronics category',
    })
  })

  it('maps description', () => {
    const result = transformCollection(makeRaw())
    expect(result.description).toBe('All electronic products')
  })

  it('maps updated_at to updatedAt', () => {
    const result = transformCollection(makeRaw())
    expect(result.updatedAt).toBe('2024-03-10T00:00:00Z')
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('handles missing image gracefully', () => {
    const result = transformCollection(makeRaw({ image: null }))
    expect(result.image).toBeUndefined()
  })
})

describe('untransformCollection (MyCashflow)', () => {
  it('round-trips title, handle, and description', () => {
    const raw = makeRaw()
    const collection = transformCollection(raw)
    const body = untransformCollection(collection)
    expect(body['name']).toBe('Electronics')
    expect(body['slug']).toBe('electronics')
    expect(body['description']).toBe('All electronic products')
  })
})
