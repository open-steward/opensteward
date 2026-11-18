import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawVtexCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/vtex/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawVtexCategory> = {}): RawVtexCategory {
  return {
    Id: 42,
    Name: 'Eletronicos',
    Description: 'Produtos eletrônicos.',
    IsActive: true,
    FatherCategoryId: null,
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps Id to string id and Name to title', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Eletronicos')
  })

  it('maps description', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('Produtos eletrônicos.')
  })

  it('sets type to MANUAL always', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('sets productIds to empty array', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual([])
  })

  it('maps ImageUrl to image.url', () => {
    const result = transformCollection(
      makeCategory({ ImageUrl: 'https://cdn.vtex.com/img/eletronicos.jpg' }),
    )
    expect(result.image).toEqual({ url: 'https://cdn.vtex.com/img/eletronicos.jpg' })
  })

  it('omits image when ImageUrl is absent', () => {
    const result = transformCollection(makeCategory({ ImageUrl: undefined }))
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
})

describe('untransformCollection', () => {
  it('round-trips title and description', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical)
    expect(raw['Name']).toBe('Eletronicos')
    expect(raw['Description']).toBe('Produtos eletrônicos.')
  })

  it('sets IsActive and ShowInStoreFront to true', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical)
    expect(raw['IsActive']).toBe(true)
    expect(raw['ShowInStoreFront']).toBe(true)
  })

  it('defaults Description to empty string when description is absent', () => {
    const raw = untransformCollection({ title: 'Eletronicos' })
    expect(raw['Description']).toBe('')
  })
})
