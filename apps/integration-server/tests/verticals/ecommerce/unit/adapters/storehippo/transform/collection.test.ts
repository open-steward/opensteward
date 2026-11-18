import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  untransformCollection,
} from '../../../../../../../src/verticals/ecommerce/adapters/storehippo/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'
import { CATEGORY } from '../fixtures'

describe('StoreHippo transformCollection (documented ms-categories fields)', () => {
  it('maps the documented example and parses with CollectionSchema', () => {
    const c = CollectionSchema.parse(transformCollection(structuredClone(CATEGORY)))
    expect(c).toMatchObject({
      id: '5d4d5393b6455f39d99da051',
      title: "Women's Apparels",
      handle: 'women-apparels',
      description: 'Trendy apparels for women.',
    })
    expect(c.metadata['parent']).toBe('Apparels')
  })

  it('omits an alias the canonical slug would reject (the docs example "Children-Wear")', () => {
    const c = CollectionSchema.parse(
      transformCollection({ ...structuredClone(CATEGORY), alias: 'Children-Wear' }),
    )
    expect(c.handle).toBeUndefined()
  })

  it('throws on a record without _id or name', () => {
    expect(() => transformCollection({ name: 'x' })).toThrow(/_id/)
    expect(() => transformCollection({ _id: 'c1' })).toThrow(/name/)
  })

  it('untransformCollection maps title to name', () => {
    expect(untransformCollection({ title: 'Men Wear' })['name']).toBe('Men Wear')
  })
})
