/**
 * Bold category → Collection. Fixture: the documented v2Category example in
 * https://developer.boldcommerce.com/api/products.openapi.yaml.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCategory,
  type RawBoldCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/category'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

const raw: RawBoldCategory = {
  id: 100,
  shop_identifier: 'zp3oafdor9',
  platform_id: { string_value: 'platform-123', int64_value: 123456 },
  name: 'Hats',
  created_at: '2021-11-04T19:09:52Z',
  updated_at: '2021-11-04T19:09:52Z',
  image_url: 'example.store.com/files/categories/hats.jpg',
}

describe('transformCategory (bold-commerce)', () => {
  it('maps the documented v2Category and passes CollectionSchema', () => {
    const out = CollectionSchema.parse(transformCategory(raw))
    expect(out).toEqual({
      id: '100',
      title: 'Hats',
      updatedAt: '2021-11-04T19:09:52.000Z',
      metadata: raw,
    })
  })

  it('keeps an absolute image URL', () => {
    const out = CollectionSchema.parse(
      transformCategory({ ...raw, image_url: 'https://cdn.example.com/hats.jpg' }),
    )
    expect(out.image).toEqual({ url: 'https://cdn.example.com/hats.jpg' })
  })

  it('throws on a category with no name', () => {
    expect(() => transformCategory({ id: 1 })).toThrow(/no name/)
  })
})
