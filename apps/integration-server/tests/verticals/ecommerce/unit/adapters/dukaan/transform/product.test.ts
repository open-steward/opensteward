import { describe, it, expect } from 'vitest'
import {
  transformProductDetail,
  transformProductListRow,
  type RawDukaanProductDetail,
  type RawDukaanProductListRow,
} from '../../../../../../../src/verticals/ecommerce/adapters/dukaan/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'
import { PRODUCT_DETAIL, PRODUCT_LIST_ROW } from '../fixtures'

const listRow = () => structuredClone(PRODUCT_LIST_ROW) as unknown as RawDukaanProductListRow
const detail = () => structuredClone(PRODUCT_DETAIL) as unknown as RawDukaanProductDetail

describe('transformProductListRow (documented product_list row)', () => {
  it('parses against ProductSchema and maps the documented fields', () => {
    const p = ProductSchema.parse(transformProductListRow(listRow()))
    expect(p.id).toBe('05ad8798-2ee0-410a-a42f-91fe3e001c57')
    expect(p.title).toBe('Hooded Bath Towel')
    expect(p.handle).toBe('hooded-bath-towel')
    expect(p.status).toBe('ACTIVE')
    expect(p.createdAt).toBe('2024-01-10T06:28:20.178Z')
    expect(p.images).toHaveLength(8)
    expect(p.images?.[0]).toEqual({
      url: 'https://dms.mydukaan.io/original/jpeg/asgard/018f81f5-f6c7-4bbc-af5b-a577c520d6b8.jpg',
      position: 0,
    })
    expect(p.metadata).toEqual(listRow())
  })

  it('maps no price: the documented row carries no currency', () => {
    const p = ProductSchema.parse(transformProductListRow(listRow()))
    expect(p.variants).toBeUndefined()
  })

  it('maps is_active false to DRAFT', () => {
    const p = ProductSchema.parse(transformProductListRow({ ...listRow(), is_active: false }))
    expect(p.status).toBe('DRAFT')
  })
})

describe('transformProductDetail (documented product_details data)', () => {
  it('parses against ProductSchema with the same id the list returns', () => {
    const p = ProductSchema.parse(transformProductDetail(detail()))
    expect(p.id).toBe('f378cb09-0b84-4b0d-a4b9-f9d65b6ce4f3')
    expect(p.title).toBe('Hair Pins')
    expect(p.description).toBe('limited-edition stackable pins')
    expect(p.handle).toBe('hair-pins')
    expect(p.status).toBe('ACTIVE')
    expect(p.images).toHaveLength(3)
    expect(p.variants).toBeUndefined()
  })

  it('omits a null description', () => {
    const p = ProductSchema.parse(transformProductDetail({ ...detail(), description: null }))
    expect(p.description).toBeUndefined()
  })
})
