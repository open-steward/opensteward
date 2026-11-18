import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawBumpaCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/bumpa/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

describe('transformCollection (bumpa)', () => {
  const raw: RawBumpaCollection = {
    id: 10,
    name: 'Accessories',
    slug: 'accessories',
    description: 'All accessories',
    image: 'https://bumpa.example.com/acc.jpg',
    product_ids: [1, 2, 3],
    updated_at: '2024-03-01T00:00:00Z',
    published_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformCollection(raw).id).toBe('10')
  })

  it('maps title from name field', () => {
    expect(transformCollection(raw).title).toBe('Accessories')
  })

  it('maps handle from slug', () => {
    expect(transformCollection(raw).handle).toBe('accessories')
  })

  it('maps description', () => {
    expect(transformCollection(raw).description).toBe('All accessories')
  })

  it('always sets type to MANUAL', () => {
    expect(transformCollection(raw).type).toBe('MANUAL')
  })

  it('maps image string to Image object', () => {
    const result = transformCollection(raw)
    expect(result.image?.url).toBe('https://bumpa.example.com/acc.jpg')
  })

  it('maps productIds as string array', () => {
    expect(transformCollection(raw).productIds).toEqual(['1', '2', '3'])
  })

  it('passes CollectionSchema validation', () => {
    expect(() => CollectionSchema.parse(transformCollection(raw))).not.toThrow()
  })

  it('uses title field when name is absent', () => {
    const withTitle: RawBumpaCollection = { ...raw, name: undefined, title: 'From Title' }
    expect(transformCollection(withTitle).title).toBe('From Title')
  })

  it('maps image object with url field', () => {
    const withImageObj: RawBumpaCollection = {
      ...raw,
      image: { url: 'https://img.example.com/x.jpg', alt: 'alt text' },
    }
    const result = transformCollection(withImageObj)
    expect(result.image?.url).toBe('https://img.example.com/x.jpg')
    expect(result.image?.alt).toBe('alt text')
  })
})

describe('untransformCollection (bumpa)', () => {
  it('round-trips name, slug, and description', () => {
    const canonical = transformCollection(raw)
    const body = untransformCollection(canonical)
    expect(body.name).toBe('Accessories')
    expect(body.slug).toBe('accessories')
    expect(body.description).toBe('All accessories')
  })

  it('includes image url', () => {
    const canonical = transformCollection(raw)
    const body = untransformCollection(canonical)
    expect(body.image).toBe('https://bumpa.example.com/acc.jpg')
  })
})

const raw: RawBumpaCollection = {
  id: 10,
  name: 'Accessories',
  slug: 'accessories',
  description: 'All accessories',
  image: 'https://bumpa.example.com/acc.jpg',
  product_ids: [1, 2, 3],
  updated_at: '2024-03-01T00:00:00Z',
  published_at: '2024-03-01T00:00:00Z',
}
