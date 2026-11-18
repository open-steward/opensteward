import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawInsalesCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/insales/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawInsalesCollection> = {}): RawInsalesCollection {
  return {
    id: 42,
    title: 'Новинки',
    permalink: 'novinki',
    description: 'Новые товары сезона',
    position: 1,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    image: {
      url: 'https://cdn.example.com/cat.jpg',
      alt: 'Категория',
      width: 800,
      height: 600,
    },
    ...overrides,
  }
}

describe('transformCollection (insales)', () => {
  it('maps id as string and title', () => {
    const result = transformCollection(makeCollection())
    expect(result.id).toBe('42')
    expect(result.title).toBe('Новинки')
  })

  it('maps handle from permalink', () => {
    const result = transformCollection(makeCollection())
    expect(result.handle).toBe('novinki')
  })

  it('maps description', () => {
    const result = transformCollection(makeCollection())
    expect(result.description).toBe('Новые товары сезона')
  })

  it('maps image url, alt, width, height', () => {
    const result = transformCollection(makeCollection())
    expect(result.image?.url).toBe('https://cdn.example.com/cat.jpg')
    expect(result.image?.alt).toBe('Категория')
    expect(result.image?.width).toBe(800)
    expect(result.image?.height).toBe(600)
  })

  it('maps updatedAt', () => {
    const result = transformCollection(makeCollection())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('defaults type to MANUAL', () => {
    const result = transformCollection(makeCollection())
    expect(result.type).toBe('MANUAL')
  })

  it('accepts SMART type override', () => {
    const result = transformCollection(makeCollection(), 'SMART')
    expect(result.type).toBe('SMART')
  })

  it('omits image when null', () => {
    const result = transformCollection(makeCollection({ image: null }))
    expect(result.image).toBeUndefined()
  })

  it('omits description when null', () => {
    const result = transformCollection(makeCollection({ description: null }))
    expect(result.description).toBeUndefined()
  })

  it('uses original_url when url is missing', () => {
    const result = transformCollection(
      makeCollection({ image: { original_url: 'https://cdn.example.com/orig.jpg' } }),
    )
    expect(result.image?.url).toBe('https://cdn.example.com/orig.jpg')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeCollection()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeCollection())
    const body = untransformCollection(canonical)
    expect(body['title']).toBe('Новинки')
    expect(body['permalink']).toBe('novinki')
    expect(body['description']).toBe('Новые товары сезона')
  })
})
