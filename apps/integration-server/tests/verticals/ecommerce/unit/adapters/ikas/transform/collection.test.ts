import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawIkasCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/ikas/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawIkasCategory> = {}): RawIkasCategory {
  return {
    id: 'cat-001',
    name: 'Summer Wear',
    description: 'All summer clothing',
    parentId: null,
    isActive: true,
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (ikas)', () => {
  it('maps id and title from raw fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('cat-001')
    expect(result.title).toBe('Summer Wear')
  })

  it('maps description and updatedAt', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('All summer clothing')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('always emits type MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('omits description when null', () => {
    const result = transformCollection(makeCategory({ description: null }))
    expect(result.description).toBeUndefined()
  })

  it('omits updatedAt when null', () => {
    const result = transformCollection(makeCategory({ updatedAt: null }))
    expect(result.updatedAt).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() => CollectionSchema.parse(transformCollection(makeCategory()))).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const body = untransformCollection(canonical)
    expect(body['name']).toBe('Summer Wear')
    expect(body['description']).toBe('All summer clothing')
  })
})
