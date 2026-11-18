import { describe, it, expect } from 'vitest'
import {
  transformListProduct,
  transformProductInfo,
  transformVariant,
  type RawAlibabaListProduct,
  type RawAlibabaProductInfo,
} from '../../../../../../../src/verticals/ecommerce/adapters/alibaba/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'
import { PRODUCT_GET_V2, PRODUCT_LIST } from '../fixtures'

const listRow = PRODUCT_LIST.result.products[0] as unknown as RawAlibabaListProduct
const info = PRODUCT_GET_V2.product_info as unknown as RawAlibabaProductInfo

describe('alibaba transformListProduct (documented product.list row)', () => {
  it('maps the documented summary fields and parses as a Product', () => {
    const p = ProductSchema.parse(transformListProduct(listRow))
    expect(p.id).toBe('188909844009')
    expect(p.title).toBe('new mp3 player')
    expect(p.variants).toBeUndefined()
    expect(p.metadata['status']).toBe('approved')
  })

  it('does not give the zone-less gmt_create / gmt_modified a time zone', () => {
    const p = transformListProduct(listRow)
    expect(p.createdAt).toBeUndefined()
    expect(p.updatedAt).toBeUndefined()
  })

  it('maps keywords to tags and main_image.images to images', () => {
    const p = ProductSchema.parse(
      transformListProduct({
        ...listRow,
        keywords: ['mp3', 'player'],
        main_image: { images: ['https://sc04.alicdn.com/a.jpg', 'https://sc04.alicdn.com/b.jpg'] },
      }),
    )
    expect(p.tags).toEqual(['mp3', 'player'])
    expect(p.images).toEqual([
      { url: 'https://sc04.alicdn.com/a.jpg', position: 0 },
      { url: 'https://sc04.alicdn.com/b.jpg', position: 1 },
    ])
  })

  it('refuses a row without an id', () => {
    expect(() => transformListProduct({ ...listRow, id: undefined })).toThrow(/no id/)
  })
})

describe('alibaba transformProductInfo (documented get/v2 product_info)', () => {
  it('maps basic_info, category and SKU-priced variants and parses as a Product', () => {
    const p = ProductSchema.parse(transformProductInfo(info))
    expect(p.id).toBe('1601449197602')
    expect(p.title).toBe('this is a sample title')
    expect(p.description).toBe('product details')
    expect(p.productType).toBe("Apparel & Accessories / Men's Clothing / Men's T-Shirts")
    expect(p.createdAt).toBe(new Date(1747809487000).toISOString())
    expect(p.updatedAt).toBe(new Date(1748249727000).toISOString())
    expect(p.images).toEqual([
      { url: 'https://sc04.alicdn.com/kf/Hafea40435f2f4354b81fb4e5476fc65cT.png', position: 0 },
    ])
    expect(p.variants).toHaveLength(1)
    const v = p.variants![0]!
    expect(v.id).toBe('106714736001')
    expect(v.productId).toBe('1601449197602')
    expect(v.sku).toBe('3523LDS')
    // sku_price { price: "10", currency: "USD" } → 1000 minor units
    expect(v.price).toEqual({ amount: 1000, currency: 'USD' })
    expect(v.optionValues).toEqual({ Color: 'Black' })
  })

  it('leaves out a SKU with no sku_price instead of pricing it', () => {
    const sku = { sku_id: '1', sku_code: 'X' }
    expect(transformVariant(sku, 'p')).toBeUndefined()
    expect(transformVariant({ ...sku, sku_price: { price: '5' } }, 'p')).toBeUndefined()
    expect(transformVariant({ ...sku, sku_price: { currency: 'USD' } }, 'p')).toBeUndefined()
  })

  it('uses the SKU currency for minor units', () => {
    const v = transformVariant({ sku_id: '1', sku_price: { price: '1000', currency: 'JPY' } }, 'p')
    expect(v?.price).toEqual({ amount: 1000, currency: 'JPY' })
  })

  it('refuses product_info without basic_info.product_id', () => {
    expect(() => transformProductInfo({ ...info, basic_info: {} })).toThrow(/product_id/)
  })

  it('refuses a product without a title rather than inventing an empty one', () => {
    expect(() => transformListProduct({ ...listRow, subject: undefined })).toThrow(/no subject/)
    expect(() =>
      transformProductInfo({ ...info, basic_info: { ...info.basic_info, title: '' } }),
    ).toThrow(/no basic_info.title/)
  })
})
