// NuORDER Catalog/CatalogEntry fields verified against
// https://assets.nuorder.com/api-docs/index.html
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawNuorderCatalog,
} from '../../../../../../../src/verticals/ecommerce/adapters/nuorder/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawNuorderCatalog> = {}): RawNuorderCatalog {
  return {
    id: 501,
    sync_id: 'sync-1',
    brand_id: 'brand_1',
    title: 'Spring 2026',
    description: 'Spring 2026 lookbook',
    active: true,
    archived: false,
    created_on: '2025-11-01T00:00:00Z',
    modified_on: '2026-01-10T00:00:00Z',
    entries: [
      { type: 'item', item_id: 4001, sort: 0 },
      { type: 'separator', sort: 1 },
      { type: 'item', item_id: 4002, sort: 2 },
    ],
    ...overrides,
  }
}

describe('transformCollection (NuORDER Catalog)', () => {
  it('passes the canonical schema', () => {
    expect(() => CollectionSchema.parse(transformCollection(makeRaw()))).not.toThrow()
  })

  it('maps id to string canonical id', () => {
    expect(transformCollection(makeRaw()).id).toBe('501')
  })

  it('throws rather than inventing an id when id is absent', () => {
    expect(() => transformCollection(makeRaw({ id: undefined }))).toThrow(/id/i)
  })

  it('maps title/description through', () => {
    const result = transformCollection(makeRaw())
    expect(result.title).toBe('Spring 2026')
    expect(result.description).toBe('Spring 2026 lookbook')
  })

  it('builds productIds from catalog entries with an item_id, skipping separators', () => {
    expect(transformCollection(makeRaw()).productIds).toEqual(['4001', '4002'])
  })

  it('omits productIds when there are no item entries', () => {
    const result = transformCollection(makeRaw({ entries: [{ type: 'separator' }] }))
    expect(result.productIds).toBeUndefined()
  })

  it('leaves type unset — no manual/smart distinction is documented for catalogs', () => {
    expect(transformCollection(makeRaw()).type).toBeUndefined()
  })

  it('converts modified_on to ISO 8601', () => {
    expect(transformCollection(makeRaw()).updatedAt).toBe('2026-01-10T00:00:00.000Z')
  })

  it('preserves the raw record as metadata', () => {
    const raw = makeRaw()
    expect(transformCollection(raw).metadata).toEqual(raw)
  })
})

describe('untransformCollection (NuORDER)', () => {
  it('emits only title/description', () => {
    expect(untransformCollection({ title: 'T', description: 'D' })).toEqual({ title: 'T', description: 'D' })
  })
})
