import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawSyliusTaxon,
} from '../../../../../../../src/verticals/ecommerce/adapters/sylius/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeTaxon(overrides: Partial<RawSyliusTaxon> = {}): RawSyliusTaxon {
  return {
    id: 5,
    code: 'MUGS',
    name: 'Mugs',
    slug: 'mugs',
    description: 'All our mug styles',
    position: 2,
    enabled: true,
    parent: { code: 'CATEGORY', name: 'Category' },
    translations: {
      en: { name: 'Mugs', slug: 'mugs', description: 'All our mug styles' },
    },
    updatedAt: '2024-03-01T12:00:00Z',
    createdAt: '2024-01-15T08:00:00Z',
    ...overrides,
  }
}

describe('transformCollection (Sylius)', () => {
  it('maps core fields', () => {
    const result = transformCollection(makeTaxon())
    expect(result.id).toBe('MUGS')
    expect(result.title).toBe('Mugs')
    expect(result.handle).toBe('mugs')
    expect(result.description).toBe('All our mug styles')
    expect(result.type).toBe('MANUAL')
  })

  it('falls back to translations when name is missing', () => {
    const result = transformCollection(makeTaxon({ name: undefined }))
    expect(result.title).toBe('Mugs')
  })

  it('falls back to code when name and translations are missing', () => {
    const result = transformCollection(makeTaxon({ name: undefined, translations: undefined }))
    expect(result.title).toBe('MUGS')
  })

  it('preserves metadata', () => {
    const raw = makeTaxon()
    const result = transformCollection(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies CollectionSchema', () => {
    const result = transformCollection(makeTaxon())
    expect(() => CollectionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const canonical = transformCollection(makeTaxon())
    const body = untransformCollection(canonical)
    expect(body['code']).toBe('MUGS')
    expect((body['translations'] as Record<string, Record<string, unknown>>)['en']['name']).toBe('Mugs')
    expect((body['translations'] as Record<string, Record<string, unknown>>)['en']['slug']).toBe('mugs')
  })
})
