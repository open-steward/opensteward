import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawIzbergCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/izberg/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawIzbergCategory> = {}): RawIzbergCategory {
  return {
    id: 7,
    resource_uri: '/v1/category/7/',
    name: 'Electronics',
    description: 'Consumer electronics',
    slug: 'electronics',
    parent: null,
    image: 'https://cdn.izberg.com/cat/electronics.jpg',
    is_active: true,
    ...overrides,
  }
}

describe('transformCollection (izberg)', () => {
  it('maps id as string and title from name', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('7')
    expect(result.title).toBe('Electronics')
  })

  it('falls back to id string when name is null', () => {
    const result = transformCollection(makeCategory({ name: null }))
    expect(result.title).toBe('7')
  })

  it('maps description', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('Consumer electronics')
  })

  it('maps handle from slug', () => {
    const result = transformCollection(makeCategory())
    expect(result.handle).toBe('electronics')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('maps image url', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.izberg.com/cat/electronics.jpg')
  })

  it('omits image when null', () => {
    const result = transformCollection(makeCategory({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('omits description when null', () => {
    const result = transformCollection(makeCategory({ description: null }))
    expect(result.description).toBeUndefined()
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const body = untransformCollection(canonical)
    expect(body['name']).toBe('Electronics')
    expect(body['slug']).toBe('electronics')
    expect(body['description']).toBe('Consumer electronics')
  })
})
