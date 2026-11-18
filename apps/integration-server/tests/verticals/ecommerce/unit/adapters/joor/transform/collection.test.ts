import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawJoorCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/joor/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

describe('transformCollection (joor)', () => {
  const raw: RawJoorCollection = {
    id: 'lsh-001',
    name: 'Spring 2024',
    external_id: 'spring-2024',
    archived: false,
    items: [
      { product_id: 'prod-a', identifier: 'a', order_number: 1 },
      { product_id: 'prod-b', identifier: 'b', order_number: 2 },
    ],
    season: { id: 's1', name: 'Spring', year: 2024 },
  }

  it('maps id directly', () => {
    const result = transformCollection(raw)
    expect(result.id).toBe('lsh-001')
  })

  it('maps title from name', () => {
    const result = transformCollection(raw)
    expect(result.title).toBe('Spring 2024')
  })

  it('maps handle from external_id', () => {
    const result = transformCollection(raw)
    expect(result.handle).toBe('spring-2024')
  })

  it('always sets type to MANUAL', () => {
    const result = transformCollection(raw)
    expect(result.type).toBe('MANUAL')
  })

  it('collects productIds from items', () => {
    const result = transformCollection(raw)
    expect(result.productIds).toEqual(['prod-a', 'prod-b'])
  })

  it('omits productIds when items have no product_id', () => {
    const result = transformCollection({
      ...raw,
      items: [{ identifier: 'x' }],
    })
    expect(result.productIds).toBeUndefined()
  })

  it('produces schema-valid output', () => {
    const result = transformCollection(raw)
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const result = transformCollection(raw)
    const back = untransformCollection(result)
    expect(back.name).toBe(raw.name)
    expect(back.external_id).toBe(raw.external_id)
    expect(back.items).toEqual([{ product_id: 'prod-a' }, { product_id: 'prod-b' }])
  })
})
