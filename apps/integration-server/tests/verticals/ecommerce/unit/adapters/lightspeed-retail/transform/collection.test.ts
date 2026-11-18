import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawLightspeedCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawLightspeedCategory> = {}): RawLightspeedCategory {
  return {
    categoryID: '10',
    name: 'Coffee',
    parentID: '0',
    nodeDepth: '0',
    fullPathName: 'Coffee',
    createTime: '2024-01-01T00:00:00+00:00',
    timeStamp: '2024-06-15T12:00:00+00:00',
    ...overrides,
  }
}

describe('transformCollection (Lightspeed Retail)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('10')
    expect(result.title).toBe('Coffee')
    expect(result.type).toBe('MANUAL')
    expect(result.description).toBe('Coffee')
    expect(result.updatedAt).toBe('2024-06-15T12:00:00+00:00')
  })

  it('maps nested category path', () => {
    const result = transformCollection(makeCategory({ fullPathName: 'Coffee > Beans' }))
    expect(result.description).toBe('Coffee > Beans')
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

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical)
    expect(raw['name']).toBe('Coffee')
  })
})
