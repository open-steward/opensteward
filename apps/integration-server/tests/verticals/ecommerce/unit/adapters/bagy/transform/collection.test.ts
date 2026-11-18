import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawBagyCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/bagy/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawBagyCategory> = {}): RawBagyCategory {
  return {
    id: 10,
    name: 'Moda Feminina',
    slug: 'moda-feminina',
    description: 'Roupas femininas',
    modified: '2024-03-01T00:00:00Z',
    created: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (Bagy)', () => {
  it('maps id to string', () => {
    const result = transformCollection(makeCategory({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps name to title', () => {
    const result = transformCollection(makeCategory())
    expect(result.title).toBe('Moda Feminina')
  })

  it('maps slug to handle', () => {
    const result = transformCollection(makeCategory())
    expect(result.handle).toBe('moda-feminina')
  })

  it('hardcodes type as MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('maps description', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('Roupas femininas')
  })

  it('maps updatedAt from modified via toIsoDatetime', () => {
    const result = transformCollection(makeCategory())
    // toIsoDatetime returns the value as-is for valid ISO strings
    expect(result.updatedAt).toBeTruthy()
  })

  it('image is undefined (Bagy categories have no image)', () => {
    const result = transformCollection(makeCategory())
    expect(result.image).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (Bagy)', () => {
  it('maps title to name', () => {
    const body = untransformCollection({ title: 'Shoes' })
    expect(body.name).toBe('Shoes')
  })

  it('maps handle to slug', () => {
    const body = untransformCollection({ handle: 'shoes' })
    expect(body.slug).toBe('shoes')
  })

  it('maps description', () => {
    const body = untransformCollection({ description: 'All shoes' })
    expect(body.description).toBe('All shoes')
  })
})
