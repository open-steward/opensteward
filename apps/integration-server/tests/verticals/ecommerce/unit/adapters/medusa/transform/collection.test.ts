import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawMedusaCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/medusa/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCollection(overrides: Partial<RawMedusaCollection> = {}): RawMedusaCollection {
  return {
    id: 'col_01',
    title: 'Summer Collection',
    handle: 'summer-collection',
    products: [{ id: 'prod_01' }, { id: 'prod_02' }],
    created_at: '2024-01-10T12:00:00Z',
    updated_at: '2024-02-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (Medusa v2)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCollection())
    expect(result.id).toBe('col_01')
    expect(result.title).toBe('Summer Collection')
    expect(result.handle).toBe('summer-collection')
    expect(result.type).toBe('MANUAL')
  })

  it('maps product ids when products are expanded', () => {
    const result = transformCollection(makeCollection())
    expect(result.productIds).toEqual(['prod_01', 'prod_02'])
  })

  it('handles collection without products', () => {
    const result = transformCollection(makeCollection({ products: null }))
    expect(result.productIds).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCollection()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformCollection(makeCollection())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeCollection())
    const body = untransformCollection(canonical)
    expect(body['title']).toBe('Summer Collection')
    expect(body['handle']).toBe('summer-collection')
  })
})
