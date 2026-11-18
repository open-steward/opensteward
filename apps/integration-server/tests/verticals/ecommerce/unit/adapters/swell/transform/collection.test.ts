/**
 * Swell category transform, against "The category model" example
 * (https://developers.swell.is/backend-api/categories).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCollection,
  type RawSwellCategory,
} from '../../../../../../../src/verticals/ecommerce/adapters/swell/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'

const DOC_CATEGORY: RawSwellCategory = {
  name: 'Luck',
  active: true,
  sorting: null,
  images: [
    {
      file: {
        url: 'https://cdn.schema.io/launch-storefront/628bb4ba499bba0019b1ab7c/82fd851c2edcd4bd7ed941c561e605ea',
        width: 127,
        height: 127,
      },
      id: '628bb4be499bba0019b1ab7e',
    },
  ],
  description:
    'Luck affects all skills a little bit&mdash;with the exception of Acrobatics and Athletics.<br>',
  meta_title: 'Luck',
  parent_id: '628bae71499bba0019b1aac2',
  slug: 'skills-luck',
  top_id: '628bae71499bba0019b1aac2',
  date_created: '2022-05-23T16:06:40.137Z',
  date_updated: '2022-05-23T16:22:22.300Z',
  sort: 7,
  id: '628bb1101869c10019b4205c',
}

describe('swell transformCollection', () => {
  it('maps the documented category example and parses as a Collection', () => {
    const c = CollectionSchema.parse(transformCollection(DOC_CATEGORY))
    expect(c.id).toBe('628bb1101869c10019b4205c')
    expect(c.title).toBe('Luck')
    expect(c.handle).toBe('skills-luck')
    expect(c.image).toEqual({
      id: '628bb4be499bba0019b1ab7e',
      url: 'https://cdn.schema.io/launch-storefront/628bb4ba499bba0019b1ab7c/82fd851c2edcd4bd7ed941c561e605ea',
      width: 127,
      height: 127,
    })
    expect(c.updatedAt).toBe('2022-05-23T16:22:22.300Z')
    // Nothing documents a MANUAL/SMART distinction, and products are not expanded.
    expect(c.type).toBeUndefined()
    expect(c.productIds).toBeUndefined()
  })

  it('leaves image unset when no image has a file url', () => {
    const c = CollectionSchema.parse(
      transformCollection({ ...DOC_CATEGORY, images: [{ id: 'x', file: null }] }),
    )
    expect(c.image).toBeUndefined()
  })
})
