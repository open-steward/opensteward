import { describe, it, expect } from 'vitest'
import { transformCollection } from '../../../../../../../src/verticals/ecommerce/adapters/orderchamp/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

describe('transformCollection (Orderchamp)', () => {
  it('maps id/title', () => {
    const result = transformCollection({ id: 'col-1', title: 'Summer Picks' })
    expect(result.id).toBe('col-1')
    expect(result.title).toBe('Summer Picks')
  })

  it('falls back to id when title is absent', () => {
    expect(transformCollection({ id: 'col-1' }).title).toBe('col-1')
  })

  it('preserves raw in metadata', () => {
    const raw = { id: 'col-1', title: 'x' }
    expect(transformCollection(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => CollectionSchema.parse(transformCollection({ id: 'col-1', title: 'x' }))).not.toThrow()
  })
})
