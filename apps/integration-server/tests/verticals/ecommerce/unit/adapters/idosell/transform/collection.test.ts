/**
 * Shape verified against https://idosell.readme.io/reference/productscategoriesget
 * (`GET /products/categories`, `categories[]` with `id` / `parent_id` /
 * `lang_data[]`).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
  type RawIdosellCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/idosell/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

function makeRaw(overrides: Partial<RawIdosellCategory> = {}): RawIdosellCategory {
  return {
    id: 300,
    parent_id: 0,
    priority: 1,
    lang_data: [
      { lang_id: 'eng', singular_name: 'Bestseller', plural_name: 'Bestsellers', description: 'Our top sellers' },
    ],
    ...overrides,
  }
}

describe('transformCollection (idosell)', () => {
  it('maps id and title from lang_data', () => {
    const result = transformCollection(makeRaw())
    expect(result.id).toBe('300')
    expect(result.title).toBe('Bestseller')
  })

  it('maps description from lang_data', () => {
    expect(transformCollection(makeRaw()).description).toBe('Our top sellers')
  })

  it('is always MANUAL — IdoSell has no rule-based collection concept', () => {
    expect(transformCollection(makeRaw()).type).toBe('MANUAL')
  })

  it('picks the requested language entry when present', () => {
    const raw = makeRaw({
      lang_data: [
        { lang_id: 'eng', singular_name: 'Bestseller' },
        { lang_id: 'ger', singular_name: 'Bestseller-DE' },
      ],
    })
    expect(transformCollection(raw, 'ger').title).toBe('Bestseller-DE')
  })

  it('falls back to the id when no lang_data is present', () => {
    expect(transformCollection(makeRaw({ lang_data: undefined })).title).toBe('300')
  })

  it('produces a payload that satisfies CollectionSchema', () => {
    expect(() => CollectionSchema.parse(transformCollection(makeRaw()))).not.toThrow()
  })

  it('round-trips via untransformCollection', () => {
    const body = untransformCollection(transformCollection(makeRaw()))
    expect(body['lang_data']).toEqual([
      { lang_id: 'eng', singular_name: 'Bestseller', plural_name: 'Bestseller', description: 'Our top sellers' },
    ])
  })
})
