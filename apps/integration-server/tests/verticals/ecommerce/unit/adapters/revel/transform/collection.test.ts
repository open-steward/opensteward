import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawRevelCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/revel/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawRevelCategory> = {}): RawRevelCategory {
  return {
    id: 10,
    name: 'Beverages',
    description: 'All drinks',
    sort_order: 1,
    active: true,
    updated_date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (Revel)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeCategory())
    expect(result.id).toBe('10')
    expect(result.title).toBe('Beverages')
    expect(result.description).toBe('All drinks')
    expect(result.type).toBe('MANUAL')
  })

  it('maps timestamps', () => {
    const result = transformCollection(makeCategory())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
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

  it('handles missing optional fields', () => {
    const minimal: RawRevelCategory = { id: 99 }
    const result = transformCollection(minimal)
    expect(result.id).toBe('99')
    expect(result.title).toBe('')
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})

/**
 * The row products_suite.yaml (2025.3.0) documents for GET
 * /products/ProductCategory/ — its example values: `img_url` "Image of this
 * category", `sorting` "Sort categories on POS ascending", `updated_date`
 * "Date and time when Category was updated" (2016-09-14T11:30:06.518725, no
 * offset, read as UTC).
 */
describe('transformCollection (Revel), the documented ProductCategory row', () => {
  const documented: RawRevelCategory = {
    id: 1,
    name: 'Test',
    active: true,
    img_url: 'http://dev.revelup.com/static/_ui/images/common/logo.png',
    sorting: 2,
    establishment: '/enterprise/Establishment/1/',
    parent: '/products/ProductCategory/1925/',
    resource_uri: '/products/ProductCategory/1925/',
    created_date: '2014-03-25T05:45:51',
    updated_date: '2016-09-14T11:30:06.518725',
  }

  it('maps the documented example onto a valid Collection', () => {
    const result = transformCollection(documented)
    expect(result).toMatchObject({
      id: '1',
      title: 'Test',
      image: { url: 'http://dev.revelup.com/static/_ui/images/common/logo.png' },
      updatedAt: '2016-09-14T11:30:06.518Z',
    })
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('reads the documented img_url, and an image field alike', () => {
    expect(transformCollection({ id: 2, image: 'https://x.test/a.png' }).image).toEqual({
      url: 'https://x.test/a.png',
    })
  })
})

describe('untransformCollection (Revel)', () => {
  it('round-trips writable fields', () => {
    const raw = untransformCollection({ title: 'Food', description: 'All food items' })
    expect(raw['name']).toBe('Food')
    expect(raw['description']).toBe('All food items')
  })
})
