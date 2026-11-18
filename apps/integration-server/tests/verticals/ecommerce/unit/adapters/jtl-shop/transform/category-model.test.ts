/** Fixture keys are CategoryModel's documented attribute names (v5.8.0 REST/Models/CategoryModel.php). */
import { describe, expect, it } from 'vitest'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'
import { transformCategoryModel } from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/category-model'

const ROW = {
  id: 12,
  slug: 'zubehoer',
  name: 'Zubehör',
  description: 'Tastaturen und Mäuse',
  parentID: 0,
  sort: 1,
  lastModified: '2026-02-01',
  lft: 1,
  rght: 2,
  level: 1,
}

describe('transformCategoryModel', () => {
  it('maps the documented fields and parses as a Collection', () => {
    const c = CollectionSchema.parse(transformCategoryModel(ROW))
    expect(c).toMatchObject({
      id: '12',
      title: 'Zubehör',
      description: 'Tastaturen und Mäuse',
      handle: 'zubehoer',
    })
    expect(c.metadata).toEqual(ROW)
    expect(c.updatedAt).toBeUndefined()
  })

  it('omits an empty description and slug', () => {
    const c = CollectionSchema.parse(transformCategoryModel({ ...ROW, description: '', slug: '' }))
    expect(c.description).toBeUndefined()
    expect(c.handle).toBeUndefined()
  })

  it('throws on a nameless row', () => {
    expect(() => transformCategoryModel({ ...ROW, name: '' })).toThrow(/no name/)
  })
})
