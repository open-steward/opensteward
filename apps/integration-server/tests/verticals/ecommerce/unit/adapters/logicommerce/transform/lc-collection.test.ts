import { describe, it, expect } from 'vitest'
import {
  transformLogicommerceCategory,
  type RawLogicommerceCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/lc-collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'
import { fixture } from '../fixtures/load'

const listed = fixture<{ CATEGORIES: RawLogicommerceCategory[] }>('categories').CATEGORIES[0]!
const single = fixture<RawLogicommerceCategory>('category')

describe('transformLogicommerceCategory', () => {
  it.each([
    ['GET /categories row', listed],
    ['GET /categories/{id}', single],
  ])('maps the documented %s example to a valid canonical Collection', (_label, raw) => {
    const out = CollectionSchema.parse(transformLogicommerceCategory(raw))
    expect(out.id).toBe('1')
    // The documented example's NAME is the empty string.
    expect(out.title).toBe('')
    expect(out.description).toBeUndefined()
    expect(out.productIds).toEqual(['123'])
    expect(out.metadata).toEqual(raw)
  })

  it('maps a named category', () => {
    const out = CollectionSchema.parse(
      transformLogicommerceCategory({
        ID: 4,
        LANGUAGES: [{ LANGUAGE: 'EN', NAME: 'Hats', LONGDESCRIPTION: 'All hats' }],
      }),
    )
    expect(out).toMatchObject({ id: '4', title: 'Hats', description: 'All hats' })
    expect(out.productIds).toBeUndefined()
  })
})
