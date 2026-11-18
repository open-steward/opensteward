import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  buildActionsForCollection,
  type RawCtCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeCategory(overrides: Partial<RawCtCategory> = {}): RawCtCategory {
  return {
    id: 'cat-beverage',
    version: 1,
    key: 'beverage',
    name: { 'en-US': 'Beverages', 'de-DE': 'Getränke' },
    slug: { 'en-US': 'beverages' },
    description: { 'en-US': 'Drinks of all kinds.' },
    assets: [{ sources: [{ uri: 'https://cdn.ct.example/beverages.jpg' }] }],
    createdAt: '2024-01-01T00:00:00Z',
    lastModifiedAt: '2024-02-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (commercetools)', () => {
  it('flattens name/slug/description using the primary locale', () => {
    const result = transformCollection(makeCategory())
    expect(result.title).toBe('Beverages')
    expect(result.handle).toBe('beverages')
    expect(result.description).toBe('Drinks of all kinds.')
    expect(result.type).toBe('MANUAL')
  })

  it('maps first asset source as the collection image', () => {
    const result = transformCollection(makeCategory())
    expect(result.image?.url).toBe('https://cdn.ct.example/beverages.jpg')
  })

  it('preserves raw locale maps under metadata.localizedStrings', () => {
    const result = transformCollection(makeCategory())
    const ls = result.metadata['localizedStrings'] as Record<string, Record<string, string>>
    expect(ls.name!['de-DE']).toBe('Getränke')
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    const result = transformCollection(makeCategory())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformCollection', () => {
    const canonical = transformCollection(makeCategory())
    const raw = untransformCollection(canonical) as Record<string, Record<string, string> | undefined>
    expect(raw['name']!['en-US']).toBe('Beverages')
    expect(raw['slug']!['en-US']).toBe('beverages')
  })

  it('builds update actions from a partial patch', () => {
    const actions = buildActionsForCollection(makeCategory(), {
      title: 'Drinks',
      handle: 'drinks',
    })
    expect(actions.map((a) => a['action'])).toEqual(['changeName', 'changeSlug'])
  })
})
