/**
 * Temu goods transforms. Fixtures follow the documented `response_sample` of
 * bg.local.goods.list.query and bg.local.goods.detail.query (fetched
 * 2026-09-25 from POST https://partner-us.temu.com/riemann/api/v2/api/doc/detail/get),
 * with the sample's placeholder values ("test", 1) replaced by realistic ones.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductDetail,
  untransformProduct,
  type RawTemuGoods,
  type RawTemuGoodsDetail,
} from '../../../../../../../src/verticals/ecommerce/adapters/temu/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

/** One `result.goodsList` row, keyed exactly as the documented sample. */
function makeGoods(overrides: Partial<RawTemuGoods> = {}): RawTemuGoods {
  return {
    marketPrice: 2499,
    goodsId: 601099548666279,
    outSkuSnList: ['WH-BLK'],
    goodsStatusChangeTime: '1717228800000',
    crtTime: 1705315200,
    skuInfoList: [
      {
        specList: [{ specId: 11, parentSpecName: 'Color', parentSpecId: 1, specName: 'Black' }],
        stock: 50,
        skuId: 17592352673534,
        skuSn: 'WH-BLK',
      },
    ],
    goodsShowSubStatus: 1,
    lowTrafficTag: 2,
    outGoodsSn: 'WH-001',
    price: '19.99',
    currency: 'USD',
    thumbUrl: 'https://img.kwcdn.com/product/wh.jpg',
    goodsName: 'Wireless Headphones',
    skuIdList: [17592352673534],
    status4VO: 1,
    quantity: 50,
    subStatus4VO: 1,
    restrictedTrafficTag: 2,
    costTemplateId: 'LCT-1',
    shipmentLimitSecond: 172800,
    catId: 123,
    specName: 'Color',
    trademarkId: 0,
    brandId: 0,
    retailPrice: { amount: '19.99', currency: 'USD' },
    listPrice: { amount: '24.99', currency: 'USD' },
    ...overrides,
  }
}

function makeDetail(overrides: Partial<RawTemuGoodsDetail> = {}): RawTemuGoodsDetail {
  return {
    goodsId: 601099548666279,
    catId: 123,
    catName: 'Electronics > Audio',
    goodsName: 'Wireless Headphones',
    goodsDesc: 'Over-ear wireless headphones',
    skuList: [{ skuId: 17592352673534, retailPrice: { amount: '19.99', currency: 'USD' } }],
    ...overrides,
  }
}

describe('transformProduct (bg.local.goods.list.query row)', () => {
  it('parses with ProductSchema', () => {
    const p = ProductSchema.parse(transformProduct(makeGoods()))
    expect(p.id).toBe('601099548666279')
    expect(p.title).toBe('Wireless Headphones')
  })

  it('maps goodsId, goodsName, thumbUrl and crtTime (seconds)', () => {
    const p = transformProduct(makeGoods())
    expect(p.id).toBe('601099548666279')
    expect(p.title).toBe('Wireless Headphones')
    expect(p.images).toEqual([{ url: 'https://img.kwcdn.com/product/wh.jpg', position: 0 }])
    expect(p.createdAt).toBe('2024-01-15T10:40:00.000Z')
  })

  it('maps status4VO 1 to ACTIVE, 4 and 5 to DRAFT, anything else to unset', () => {
    expect(transformProduct(makeGoods({ status4VO: 1 })).status).toBe('ACTIVE')
    expect(transformProduct(makeGoods({ status4VO: 4 })).status).toBe('DRAFT')
    expect(transformProduct(makeGoods({ status4VO: 5 })).status).toBe('DRAFT')
    expect(transformProduct(makeGoods({ status4VO: 6 })).status).toBeUndefined()
  })

  it('does not invent variants or prices: SKU prices name no unit', () => {
    const p = transformProduct(makeGoods())
    expect(p.variants).toBeUndefined()
    expect(p.metadata['skuInfoList']).toEqual(makeGoods().skuInfoList)
  })

  it('keeps the raw row as metadata', () => {
    const raw = makeGoods()
    expect(transformProduct(raw).metadata).toEqual(raw)
  })

  it('throws on a row without goodsId or goodsName instead of inventing one', () => {
    expect(() => transformProduct(makeGoods({ goodsId: undefined }))).toThrow(/goodsId/)
    expect(() => transformProduct(makeGoods({ goodsName: undefined }))).toThrow(/goodsName/)
  })

  it('leaves images and createdAt unset when absent', () => {
    const p = ProductSchema.parse(
      transformProduct(makeGoods({ thumbUrl: undefined, crtTime: undefined })),
    )
    expect(p.images).toBeUndefined()
    expect(p.createdAt).toBeUndefined()
  })
})

describe('transformProductDetail (bg.local.goods.detail.query result)', () => {
  it('parses with ProductSchema and maps goodsId, goodsName, goodsDesc', () => {
    const p = ProductSchema.parse(transformProductDetail(makeDetail()))
    expect(p.id).toBe('601099548666279')
    expect(p.title).toBe('Wireless Headphones')
    expect(p.description).toBe('Over-ear wireless headphones')
    expect(p.variants).toBeUndefined()
  })

  it('throws without goodsId', () => {
    expect(() => transformProductDetail(makeDetail({ goodsId: undefined }))).toThrow(/goodsId/)
  })
})

describe('untransformProduct', () => {
  it('maps title to goods_name', () => {
    const result = untransformProduct({ title: 'New Product' })
    expect(result['goods_name']).toBe('New Product')
  })

  it('maps description to goods_desc', () => {
    const result = untransformProduct({ description: '<p>desc</p>' })
    expect(result['goods_desc']).toBe('<p>desc</p>')
  })

  it('maps productType to category_name', () => {
    const result = untransformProduct({ productType: 'Electronics' })
    expect(result['category_name']).toBe('Electronics')
  })

  it('maps first image url to goods_cover_img', () => {
    const result = untransformProduct({
      images: [{ url: 'https://cdn.example.com/cover.jpg' }],
    })
    expect(result['goods_cover_img']).toBe('https://cdn.example.com/cover.jpg')
  })

  it('maps variants to sku_list with price converted to major units', () => {
    const result = untransformProduct({
      variants: [
        {
          id: 'var-001',
          sku: 'CODE-001',
          title: 'Red / L',
          price: { amount: 1999, currency: 'USD' },
          metadata: {},
        },
      ],
    })
    const skuList = result['sku_list'] as Array<Record<string, unknown>>
    expect(skuList).toHaveLength(1)
    expect(skuList[0]!['sku_code']).toBe('CODE-001')
    expect(skuList[0]!['sku_name']).toBe('Red / L')
    // 1999 cents / 100 = 19.99
    expect(skuList[0]!['price']).toBeCloseTo(19.99, 2)
  })
})
