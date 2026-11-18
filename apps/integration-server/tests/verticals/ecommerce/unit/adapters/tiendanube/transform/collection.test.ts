import { describe, it, expect } from 'vitest'
import {
  transformCategory,
  untransformCategory,
  type RawTiendanubeCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiendanube/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawTiendanubeCategory> = {}): RawTiendanubeCategory {
  return {
    id: 10,
    name: { en: 'Accessories', es: 'Accesorios' },
    description: { en: 'All accessories' },
    handle: { en: 'accessories' },
    visibility: 'visible',
    visibility_updated_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformCategory (Tiendanube)', () => {
  it('maps id, title from i18n (prefers en)', () => {
    const result = transformCategory(makeCategory())
    expect(result.id).toBe('10')
    expect(result.title).toBe('Accessories')
  })

  it('maps handle from i18n and description', () => {
    const result = transformCategory(makeCategory())
    expect(result.handle).toBe('accessories')
    expect(result.description).toBe('All accessories')
  })

  it('always sets type to MANUAL', () => {
    expect(transformCategory(makeCategory()).type).toBe('MANUAL')
  })

  it('sets publishedAt when visibility is visible', () => {
    const result = transformCategory(makeCategory())
    expect(result.publishedAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('omits publishedAt when visibility is not visible', () => {
    const result = transformCategory(makeCategory({ visibility: 'hidden' }))
    expect(result.publishedAt).toBeUndefined()
  })

  it('falls back to es locale when en is missing', () => {
    const result = transformCategory(makeCategory({ name: { es: 'Accesorios' } }))
    expect(result.title).toBe('Accesorios')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCategory()
    const result = transformCategory(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CollectionSchema', () => {
    const result = transformCategory(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips title via untransformCategory', () => {
    const collection = transformCategory(makeCategory())
    const body = untransformCategory(collection)
    expect(body['name']).toEqual({ en: 'Accessories' })
    expect(body['handle']).toEqual({ en: 'accessories' })
  })
})
