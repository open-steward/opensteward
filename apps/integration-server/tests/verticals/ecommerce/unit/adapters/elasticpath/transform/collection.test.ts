import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawEpHierarchy,
} from '../../../../../../../src/verticals/ecommerce/adapters/elasticpath/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeHierarchy(overrides: Partial<RawEpHierarchy> = {}): RawEpHierarchy {
  return {
    id: 'hier-001',
    type: 'hierarchy',
    attributes: {
      name: 'Summer Collection',
      description: 'All summer products.',
      slug: 'summer-collection',
      created_at: '2024-06-01T10:00:00.000Z',
      updated_at: '2024-07-15T14:30:00.000Z',
    },
    ...overrides,
  }
}

describe('transformCollection (Elastic Path)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeHierarchy())
    expect(result.id).toBe('hier-001')
    expect(result.title).toBe('Summer Collection')
    expect(result.description).toBe('All summer products.')
    expect(result.handle).toBe('summer-collection')
    expect(result.type).toBe('MANUAL')
    expect(result.updatedAt).toBe('2024-07-15T14:30:00.000Z')
  })

  it('handles missing name gracefully', () => {
    const raw = makeHierarchy({ attributes: { slug: 'no-name' } })
    const result = transformCollection(raw)
    expect(result.title).toBe('')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeHierarchy()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeHierarchy())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (Elastic Path)', () => {
  it('round-trips writable fields', () => {
    const canonical = transformCollection(makeHierarchy())
    const body = untransformCollection(canonical) as {
      data: { type: string; attributes: Record<string, unknown> }
    }
    expect(body.data.type).toBe('hierarchy')
    expect(body.data.attributes['name']).toBe('Summer Collection')
    expect(body.data.attributes['description']).toBe('All summer products.')
    expect(body.data.attributes['slug']).toBe('summer-collection')
  })
})
