import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawQuickbutikCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/quickbutik/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawQuickbutikCategory> = {}): RawQuickbutikCategory {
  return {
    category_id: 7,
    name: 'Accessories',
    uri: 'accessories',
    description1: 'All accessories.',
    description2: null,
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps category_id to id (stringified)', () => {
    const result = transformCollection(makeCategory({ category_id: 42 }))
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
  })

  it('maps name to title', () => {
    const result = transformCollection(makeCategory({ name: 'T-Shirts' }))
    expect(result.title).toBe('T-Shirts')
  })

  it('maps uri to handle', () => {
    const result = transformCollection(makeCategory({ uri: 'my-category' }))
    expect(result.handle).toBe('my-category')
  })

  it('type is always MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('productIds is always an empty array', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual([])
  })

  it('uses description1 alone when description2 is absent', () => {
    const result = transformCollection(
      makeCategory({ description1: 'First desc', description2: null }),
    )
    expect(result.description).toBe('First desc')
  })

  it('joins description1 and description2 with newline when both are present', () => {
    const result = transformCollection(
      makeCategory({ description1: 'Part one', description2: 'Part two' }),
    )
    expect(result.description).toBe('Part one\nPart two')
  })

  it('sets description to undefined when both description fields are absent', () => {
    const result = transformCollection(makeCategory({ description1: null, description2: null }))
    expect(result.description).toBeUndefined()
  })

  it('sets handle to undefined when uri is null', () => {
    const result = transformCollection(makeCategory({ uri: null }))
    expect(result.handle).toBeUndefined()
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
})

describe('untransformCollection', () => {
  it('maps title to name', () => {
    const body = untransformCollection({ title: 'Shoes' })
    expect(body['name']).toBe('Shoes')
  })

  it('maps handle to uri', () => {
    const body = untransformCollection({ handle: 'shoes' })
    expect(body['uri']).toBe('shoes')
  })

  it('maps description to description1', () => {
    const body = untransformCollection({ description: 'All our shoes.' })
    expect(body['description1']).toBe('All our shoes.')
  })

  it('round-trips title and handle', () => {
    const original = makeCategory({ name: 'Bags', uri: 'bags' })
    const canonical = transformCollection(original)
    const body = untransformCollection(canonical)
    expect(body['name']).toBe('Bags')
    expect(body['uri']).toBe('bags')
  })
})
