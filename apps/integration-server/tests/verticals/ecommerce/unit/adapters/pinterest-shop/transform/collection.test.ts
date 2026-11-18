import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  type RawPinterestProductGroup,
} from '../../../../../../../src/verticals/ecommerce/adapters/pinterest-shop/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeProductGroup(
  overrides: Partial<RawPinterestProductGroup> = {},
): RawPinterestProductGroup {
  return {
    id: 'pg-001',
    name: 'Summer Collection 2024',
    description: 'Curated summer catalog items for the warm season.',
    catalog_type: 'RETAIL',
    status: 'ACTIVE',
    filters: { availability: 'in_stock', product_type: 'Apparel' },
    feed_id: 'feed-abc',
    created_at: '2024-04-01T09:00:00.000Z',
    updated_at: '2024-06-15T11:30:00.000Z',
    ...overrides,
  }
}

describe('transformCollection (Pinterest)', () => {
  it('maps core fields using id as canonical id', () => {
    const result = transformCollection(makeProductGroup())
    expect(result.id).toBe('pg-001')
    expect(result.title).toBe('Summer Collection 2024')
    expect(result.description).toBe('Curated summer catalog items for the warm season.')
  })

  it('always sets type to SMART for filter-based product groups', () => {
    const result = transformCollection(makeProductGroup())
    expect(result.type).toBe('SMART')
  })

  it('maps updatedAt timestamp', () => {
    const result = transformCollection(makeProductGroup())
    expect(result.updatedAt).toBe('2024-06-15T11:30:00.000Z')
  })

  it('produces a payload that satisfies CollectionSchema and preserves raw in metadata', () => {
    const raw = makeProductGroup()
    const result = transformCollection(raw)
    expect(() => CollectionSchema.parse(result)).not.toThrow()
    expect(result.metadata['id']).toBe('pg-001')
    expect(result.metadata['catalog_type']).toBe('RETAIL')
    expect(result.metadata['filters']).toEqual({ availability: 'in_stock', product_type: 'Apparel' })
  })

  it('falls back to id for title when name is missing', () => {
    const result = transformCollection(makeProductGroup({ name: undefined }))
    expect(result.title).toBe('pg-001')
  })

  it('handles minimal product group with only required fields', () => {
    const minimal: RawPinterestProductGroup = { id: 'pg-minimal' }
    const result = transformCollection(minimal)
    expect(result.id).toBe('pg-minimal')
    expect(result.title).toBe('pg-minimal')
    expect(result.description).toBeUndefined()
    expect(result.type).toBe('SMART')
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })
})
