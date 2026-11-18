import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawPetpoojaCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/petpooja/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawPetpoojaCategory> = {}): RawPetpoojaCategory {
  return {
    categoryid: 101,
    categoryname: 'Starters',
    category_image_url: 'https://cdn.petpooja.com/img/starters.jpg',
    active: 1,
    ...overrides,
  }
}

describe('petpooja transformCollection', () => {
  it('maps core fields and stringifies categoryid', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('101')
    expect(result.title).toBe('Starters')
    expect(result.type).toBe('MANUAL')
  })

  it('maps image url when present', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.petpooja.com/img/starters.jpg')
  })

  it('omits image when category_image_url is null', () => {
    const result = transformCollection(makeCategory({ category_image_url: null }))
    expect(result.image).toBeUndefined()
  })

  it('omits image when category_image_url is empty string', () => {
    const result = transformCollection(makeCategory({ category_image_url: '   ' }))
    expect(result.image).toBeUndefined()
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

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical)
    expect(raw.categoryname).toBe('Starters')
    expect(raw.category_image_url).toBe('https://cdn.petpooja.com/img/starters.jpg')
  })
})
