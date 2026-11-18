import { describe, it, expect } from 'vitest'
import {
  transformCategoryNode,
  transformCategoryRow,
  type RawAlibabaCategoryNode,
  type RawAlibabaCategoryRow,
} from '../../../../../../../src/verticals/ecommerce/adapters/alibaba/transform/collection'
import { CollectionSchema } from '../../../../../../../src/verticals/ecommerce/schema/collection'
import { CATEGORY_GET_NEW, CATEGORY_LIST_V2 } from '../fixtures'

describe('alibaba category transforms', () => {
  it('a category/get/v2 data row → Collection', () => {
    const c = CollectionSchema.parse(
      transformCategoryRow(CATEGORY_LIST_V2.data[0] as unknown as RawAlibabaCategoryRow),
    )
    expect(c).toMatchObject({ id: '1', title: 'Agriculture' })
    expect(c.type).toBeUndefined()
  })

  it('a category.get.new result → Collection', () => {
    const c = CollectionSchema.parse(
      transformCategoryNode(CATEGORY_GET_NEW.result.result as unknown as RawAlibabaCategoryNode),
    )
    expect(c).toMatchObject({ id: '127686030', title: 'Air Conditioning Systems' })
    expect(c.metadata['child_ids']).toHaveLength(6)
  })

  it('refuses a category without category_id', () => {
    expect(() => transformCategoryRow({ category_name: 'x' })).toThrow(/category_id/)
    expect(() => transformCategoryNode({ name: 'x' })).toThrow(/category_id/)
  })

  it('refuses a category without a title rather than inventing an empty one', () => {
    expect(() =>
      transformCategoryRow({ ...CATEGORY_LIST_V2.data[0], category_name: undefined }),
    ).toThrow(/category_name/)
    expect(() =>
      transformCategoryNode({
        ...(CATEGORY_GET_NEW.result.result as unknown as RawAlibabaCategoryNode),
        name: '',
      }),
    ).toThrow(/has no name/)
  })
})
