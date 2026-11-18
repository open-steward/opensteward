import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawEcwidCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/ecwid/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(
  overrides: Partial<RawEcwidCategory> = {},
): RawEcwidCategory {
  return {
    id: 12345,
    name: 'Summer Clothing',
    url: 'summer-clothing',
    parentId: 0,
    description: 'All summer items',
    enabled: true,
    orderBy: 1,
    productCount: 42,
    productIds: [100, 200, 300],
    originalImageUrl: 'https://cdn.example.com/cat/summer.jpg',
    ...overrides,
  }
}

describe('transformCollection (Ecwid)', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('12345')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Summer Clothing')
    expect(result.handle).toBe('summer-clothing')
    expect(result.description).toBe('All summer items')
    expect(result.type).toBe('MANUAL')
  })

  it('maps productIds to string array', () => {
    const result = transformCollection(makeCategory())
    expect(result.productIds).toEqual(['100', '200', '300'])
  })

  it('maps image from originalImageUrl', () => {
    const result = transformCollection(makeCategory())
    expect(result.image).toBeDefined()
    expect(result.image!.url).toBe('https://cdn.example.com/cat/summer.jpg')
  })

  it('preserves raw payload in metadata and produces schema-valid result', () => {
    const raw = makeCategory()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const body = untransformCollection(canonical)
    expect(body['name']).toBe('Summer Clothing')
    expect(body['description']).toBe('All summer items')
  })
})
