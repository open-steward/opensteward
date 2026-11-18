import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawSallaCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/salla/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawSallaCategory> = {}): RawSallaCategory {
  return {
    id: 500,
    name: 'Teas & Infusions',
    image: 'https://cdn.salla.com/teas.jpg',
    parent_id: null,
    status: 'active',
    sort_order: 1,
    metadata: { title: 'Teas', description: 'All tea products', url: '/teas' },
    update_at: { date: '2024-02-01 00:00:00', timezone: 'UTC' },
    ...overrides,
  }
}

describe('transformCollection', () => {
  it('maps id and title', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('500')
    expect(result.title).toBe('Teas & Infusions')
  })

  it('maps description from metadata', () => {
    const result = transformCollection(makeCategory())
    expect(result.description).toBe('All tea products')
  })

  it('type is always MANUAL', () => {
    expect(transformCollection(makeCategory()).type).toBe('MANUAL')
  })

  it('maps image url', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.salla.com/teas.jpg')
  })

  it('parses date object for updatedAt', () => {
    const result = transformCollection(makeCategory())
    expect(result.updatedAt).toBeDefined()
  })

  it('parses string updated_at', () => {
    const result = transformCollection(makeCategory({ updated_at: '2024-04-01T00:00:00Z' }))
    expect(result.updatedAt).toBeDefined()
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
    expect(raw.name).toBe('Teas & Infusions')
  })
})
