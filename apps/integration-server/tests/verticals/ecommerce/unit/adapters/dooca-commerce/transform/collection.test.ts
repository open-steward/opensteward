import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawDoocaCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/dooca-commerce/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawDoocaCategory> = {}): RawDoocaCategory {
  return {
    id: 42,
    name: 'Summer Sale',
    slug: 'summer-sale',
    description: '<p>Best summer deals</p>',
    image: { url: 'https://example.com/summer.jpg', title: 'Summer banner' },
    active: true,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (Dooca Commerce)', () => {
  it('maps id as string from numeric id', () => {
    const result = transformCollection(makeCategory({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps name to title', () => {
    const result = transformCollection(makeCategory())
    expect(result.title).toBe('Summer Sale')
  })

  it('maps slug to handle', () => {
    const result = transformCollection(makeCategory())
    expect(result.handle).toBe('summer-sale')
  })

  it('maps description', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('<p>Best summer deals</p>')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCollection(makeCategory())
    expect(result.type).toBe('MANUAL')
  })

  it('maps image url and alt from image object', () => {
    const result = transformCollection(makeCategory())
    expect(result.image).toBeDefined()
    expect(result.image!.url).toBe('https://example.com/summer.jpg')
    expect(result.image!.alt).toBe('Summer banner')
  })

  it('returns undefined image when image is null', () => {
    const result = transformCollection(makeCategory({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('returns undefined image when image has no url', () => {
    const result = transformCollection(makeCategory({ image: { title: 'no url' } }))
    expect(result.image).toBeUndefined()
  })

  it('maps updatedAt', () => {
    const result = transformCollection(makeCategory())
    expect(result.updatedAt).toBeDefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing slug gracefully', () => {
    const result = transformCollection(makeCategory({ slug: null }))
    expect(result.handle).toBeUndefined()
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCollection (Dooca Commerce)', () => {
  it('maps title to name', () => {
    const body = untransformCollection({ title: 'Winter Sale' })
    expect(body['name']).toBe('Winter Sale')
  })

  it('maps handle to slug', () => {
    const body = untransformCollection({ handle: 'winter-sale' })
    expect(body['slug']).toBe('winter-sale')
  })

  it('maps image url', () => {
    const body = untransformCollection({
      image: { url: 'https://example.com/img.jpg', alt: 'img' },
    })
    expect((body['image'] as { url: string }).url).toBe('https://example.com/img.jpg')
  })

  it('sets active to true', () => {
    const body = untransformCollection({ title: 'Test' })
    expect(body['active']).toBe(true)
  })
})
