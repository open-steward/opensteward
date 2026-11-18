import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  type RawDukaanCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/dukaan/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'
import { CATEGORY_ROW } from '../fixtures'

const row = () => structuredClone(CATEGORY_ROW) as unknown as RawDukaanCategory

describe('transformCollection (documented get_category_list row)', () => {
  it('parses against CollectionSchema and maps the documented fields', () => {
    const c = CollectionSchema.parse(transformCollection(row()))
    expect(c.id).toBe('956b3b3d-6bbb-4fce-b3ad-996797b55f78')
    expect(c.title).toBe('Routine')
    expect(c.handle).toBe('routine')
    expect(c.image).toEqual({
      url: 'https://dms.mydukaan.io/original/jpeg/asgard/b2d1d3a2-0c66-4332-9f04-1c3e86937f93.jpg',
    })
    expect(c.type).toBeUndefined()
    expect(c.metadata).toEqual(row())
  })

  it('omits a null image', () => {
    const c = CollectionSchema.parse(transformCollection({ ...row(), image: null }))
    expect(c.image).toBeUndefined()
  })
})
