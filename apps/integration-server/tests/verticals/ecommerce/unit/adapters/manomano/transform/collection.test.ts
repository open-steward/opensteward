import { describe, it, expect } from 'vitest'
import {
  transformCategory,
  type RawManomanoCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/manomano/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawManomanoCategory> = {}): RawManomanoCategory {
  return {
    id: 'cat-100',
    name: 'Power Tools',
    slug: 'power-tools',
    parent_id: 'cat-10',
    description: 'Drills, saws, and more.',
    image_url: 'https://cdn.example.com/power-tools.jpg',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCategory (ManoMano)', () => {
  it('maps id and title', () => {
    const result = transformCategory(makeRaw())
    expect(result.id).toBe('cat-100')
    expect(result.title).toBe('Power Tools')
  })

  it('maps slug to handle', () => {
    const result = transformCategory(makeRaw())
    expect(result.handle).toBe('power-tools')
  })

  it('maps description', () => {
    const result = transformCategory(makeRaw())
    expect(result.description).toBe('Drills, saws, and more.')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCategory(makeRaw())
    expect(result.type).toBe('MANUAL')
  })

  it('maps image from image_url', () => {
    const result = transformCategory(makeRaw())
    expect(result.image).toEqual({ url: 'https://cdn.example.com/power-tools.jpg' })
  })

  it('omits image when image_url is null', () => {
    const result = transformCategory(makeRaw({ image_url: null }))
    expect(result.image).toBeUndefined()
  })

  it('maps updatedAt datetime', () => {
    const result = transformCategory(makeRaw())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('casts numeric id to string', () => {
    const result = transformCategory(makeRaw({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('uses undefined handle when slug is null', () => {
    const result = transformCategory(makeRaw({ slug: null }))
    expect(result.handle).toBeUndefined()
  })

  it('produces schema-valid output', () => {
    const result = transformCategory(makeRaw())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformCategory(raw)
    expect(result.metadata).toBe(raw)
  })
})
