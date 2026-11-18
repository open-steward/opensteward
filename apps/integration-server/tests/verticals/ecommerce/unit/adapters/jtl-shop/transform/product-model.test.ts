/**
 * Fixture keys are ProductModel's documented attribute names (v5.8.0
 * includes/src/REST/Models/ProductModel.php), which is what GET /product and
 * GET /product/{id} answer (the model's rawArray(true)).
 */
import { describe, expect, it } from 'vitest'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'
import { transformProductModel } from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/product-model'

const ROW = {
  id: 4711,
  manufacturerID: 3,
  parentID: 0,
  slug: 'wireless-keyboard',
  sku: 'WK-2026',
  name: 'Funktastatur',
  description: '<p>Kompakt.</p>',
  stockQty: 12,
  created: '2026-01-15',
  lastModified: '2026-02-01 14:20:00',
  prices: [],
}

describe('transformProductModel', () => {
  it('maps the documented id, name, description and slug, and parses as a Product', () => {
    const p = ProductSchema.parse(transformProductModel(ROW))
    expect(p).toMatchObject({
      id: '4711',
      title: 'Funktastatur',
      description: '<p>Kompakt.</p>',
      handle: 'wireless-keyboard',
    })
    expect(p.metadata).toEqual(ROW)
  })

  it('leaves zone-less shop dates in metadata instead of guessing a zone', () => {
    const p = transformProductModel(ROW)
    expect(p.createdAt).toBeUndefined()
    expect(p.updatedAt).toBeUndefined()
  })

  it('drops a slug the canonical Slug cannot hold rather than rewriting it', () => {
    const p = ProductSchema.parse(transformProductModel({ ...ROW, slug: 'Funk-Tastatur_ä' }))
    expect(p.handle).toBeUndefined()
  })

  it('throws on a row with no name or no id rather than inventing one', () => {
    expect(() => transformProductModel({ ...ROW, name: null })).toThrow(/no name/)
    expect(() => transformProductModel({ ...ROW, id: 0 })).toThrow(/no usable id/)
  })
})
