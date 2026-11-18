import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawJumpsellerCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/jumpseller/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

describe('transformCollection (jumpseller)', () => {
  const raw: RawJumpsellerCategory = {
    id: 12,
    name: 'Outdoor Clothing',
    permalink: 'outdoor-clothing',
    description: '<p>Gear up for the outdoors.</p>',
    parent_id: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformCollection(raw)
    expect(result.id).toBe('12')
  })

  it('maps title from name', () => {
    const result = transformCollection(raw)
    expect(result.title).toBe('Outdoor Clothing')
  })

  it('maps handle from permalink', () => {
    const result = transformCollection(raw)
    expect(result.handle).toBe('outdoor-clothing')
  })

  it('maps description', () => {
    const result = transformCollection(raw)
    expect(result.description).toBe('<p>Gear up for the outdoors.</p>')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCollection(raw)
    expect(result.type).toBe('MANUAL')
  })

  it('maps updatedAt from updated_at', () => {
    const result = transformCollection(raw)
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces schema-valid output', () => {
    const result = transformCollection(raw)
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('handles null permalink gracefully', () => {
    const result = transformCollection({ ...raw, permalink: null })
    expect(result.handle).toBeUndefined()
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const result = transformCollection(raw)
    const back = untransformCollection(result)
    expect(back.name).toBe(raw.name)
    expect(back.permalink).toBe(raw.permalink)
    expect(back.description).toBe(raw.description)
  })
})
