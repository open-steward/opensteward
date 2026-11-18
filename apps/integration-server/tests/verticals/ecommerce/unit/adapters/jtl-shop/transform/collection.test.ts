import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawJtlShopCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

describe('transformCollection (jtl-shop)', () => {
  const raw: RawJtlShopCategory = {
    id: 7,
    name: 'Outdoor Gear',
    description: '<p>Everything for outdoor adventures.</p>',
    urlPath: 'outdoor-gear',
    parentId: null,
    active: true,
    image: {
      url: 'https://cdn.example.com/outdoor.jpg',
      alt: 'Outdoor Gear',
    },
    modified: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformCollection(raw)
    expect(result.id).toBe('7')
  })

  it('maps title from name', () => {
    const result = transformCollection(raw)
    expect(result.title).toBe('Outdoor Gear')
  })

  it('maps handle from urlPath', () => {
    const result = transformCollection(raw)
    expect(result.handle).toBe('outdoor-gear')
  })

  it('maps description', () => {
    const result = transformCollection(raw)
    expect(result.description).toBe('<p>Everything for outdoor adventures.</p>')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCollection(raw)
    expect(result.type).toBe('MANUAL')
  })

  it('maps image url and alt', () => {
    const result = transformCollection(raw)
    expect(result.image?.url).toBe('https://cdn.example.com/outdoor.jpg')
    expect(result.image?.alt).toBe('Outdoor Gear')
  })

  it('maps updatedAt from modified', () => {
    const result = transformCollection(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces schema-valid output', () => {
    const result = transformCollection(raw)
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformCollection({ id: 1, name: 'Root' })
    expect(result.handle).toBeUndefined()
    expect(result.image).toBeUndefined()
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const result = transformCollection(raw)
    const back = untransformCollection(result)
    expect(back.name).toBe(raw.name)
    expect(back.urlPath).toBe(raw.urlPath)
    expect(back.description).toBe(raw.description)
  })
})
