import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawCrystallizeTopic,
} from '../../../../../../../src/verticals/ecommerce/adapters/crystallize/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeTopic(overrides: Partial<RawCrystallizeTopic> = {}): RawCrystallizeTopic {
  return {
    id: 'topic-001',
    name: 'Summer Collection',
    path: 'topics-summer-collection',
    items: {
      edges: [
        { node: { id: 'prod-001' } },
        { node: { id: 'prod-002' } },
      ],
    },
    ...overrides,
  }
}

describe('transformCollection (Crystallize)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeTopic())
    expect(result.id).toBe('topic-001')
    expect(result.title).toBe('Summer Collection')
    expect(result.handle).toBe('topics-summer-collection')
    expect(result.type).toBe('MANUAL')
  })

  it('maps product ids from items edges', () => {
    const result = transformCollection(makeTopic())
    expect(result.productIds).toEqual(['prod-001', 'prod-002'])
  })

  it('uses pre-resolved productIds when available', () => {
    const result = transformCollection(makeTopic({ productIds: ['p1', 'p2', 'p3'], items: undefined }))
    expect(result.productIds).toEqual(['p1', 'p2', 'p3'])
  })

  it('handles empty items', () => {
    const result = transformCollection(makeTopic({ items: { edges: [] } }))
    expect(result.productIds).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeTopic()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeTopic())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeTopic())
    const raw = untransformCollection(canonical)
    expect(raw['name']).toBe('Summer Collection')
    expect(raw['path']).toBe('topics-summer-collection')
  })
})
