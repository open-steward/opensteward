import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawWebflowCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/webflow/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawWebflowCollection> = {}): RawWebflowCollection {
  return {
    id: 'coll_abc',
    displayName: 'Blog Posts',
    singularName: 'Blog Post',
    slug: 'blog-posts',
    createdOn: '2024-01-15T10:00:00Z',
    lastUpdated: '2024-02-15T11:00:00Z',
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCollection())
    expect(result.id).toBe('coll_abc')
    expect(result.title).toBe('Blog Posts')
    expect(result.handle).toBe('blog-posts')
    expect(result.type).toBe('MANUAL')
  })

  it('falls back to singularName when displayName is missing', () => {
    const result = transformCollection(makeCollection({ displayName: undefined }))
    expect(result.title).toBe('Blog Post')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCollection()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCollection())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeCollection())
    const raw = untransformCollection(canonical)
    expect(raw.displayName).toBe('Blog Posts')
    expect(raw.slug).toBe('blog-posts')
  })
})
