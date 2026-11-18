import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapProductStatus,
  type RawJdSku,
} from '../../../../../../../src/verticals/ecommerce/adapters/jdcom/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeSku(overrides: Partial<RawJdSku> = {}): RawJdSku {
  return {
    sku_id: 10086001,
    ware_id: 50001,
    title: '华为Mate 60 Pro 手机',
    upc_code: '6901443698752',
    item_num: 'HW-M60P-BK',
    outer_id: 'SELLER-SKU-001',
    jd_price: 6999.00,
    market_price: 7999.00,
    cost_price: 5500.00,
    status: 1,
    weight: 0.225,
    length: 163.7,
    width: 75.9,
    height: 8.1,
    category_id: 9987,
    brand_id: 8557,
    brand_name: '华为（HUAWEI）',
    stock_num: 150,
    images: [
      { path: 'https://img14.360buyimg.com/n1/sku_001_main.jpg', is_primary: 1, order_sort: 0 },
      { path: 'https://img14.360buyimg.com/n1/sku_001_side.jpg', is_primary: 0, order_sort: 1 },
    ],
    sale_attrs: [
      {
        attr_id: 1,
        attr_name: '颜色',
        attr_values: [
          { attr_value_id: 101, attr_value_name: '雅丹黑' },
          { attr_value_id: 102, attr_value_name: '白沙银' },
        ],
      },
    ],
    created: '2024-01-15 10:30:00',
    modified: '2024-03-20 14:00:00',
    ...overrides,
  }
}

describe('transformProduct (JD.com)', () => {
  it('uses sku_id as the canonical id', () => {
    const result = transformProduct(makeSku())
    expect(result.id).toBe('10086001')
    expect(result.title).toBe('华为Mate 60 Pro 手机')
  })

  it('maps status 1 to ACTIVE', () => {
    expect(transformProduct(makeSku()).status).toBe('ACTIVE')
  })

  it('maps status 2 to DRAFT (delisted)', () => {
    const result = transformProduct(makeSku({ status: 2 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status 4 to ARCHIVED (deleted)', () => {
    const result = transformProduct(makeSku({ status: 4 }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('extracts images with positions', () => {
    const result = transformProduct(makeSku())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://img14.360buyimg.com/n1/sku_001_main.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://img14.360buyimg.com/n1/sku_001_side.jpg',
      position: 1,
    })
  })

  it('surfaces brand_name as vendor and category_id as productType', () => {
    const result = transformProduct(makeSku())
    expect(result.vendor).toBe('华为（HUAWEI）')
    expect(result.productType).toBe('9987')
  })

  it('creates a default variant with CNY price info', () => {
    const result = transformProduct(makeSku())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.price).toEqual({ amount: 6999, currency: 'CNY' })
    expect(result.variants![0]!.compareAtPrice).toEqual({ amount: 7999, currency: 'CNY' })
  })

  it('omits compareAtPrice when market_price equals jd_price', () => {
    const result = transformProduct(makeSku({ jd_price: 6999, market_price: 6999 }))
    expect(result.variants![0]!.compareAtPrice).toBeUndefined()
  })

  it('includes barcode from upc_code', () => {
    const result = transformProduct(makeSku())
    expect(result.variants![0]!.barcode).toBe('6901443698752')
  })

  it('converts date strings to ISO strings', () => {
    const result = transformProduct(makeSku())
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeSku()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['sku_id']).toBe(10086001)
    expect(result.metadata['brand_name']).toBe('华为（HUAWEI）')
  })

  it('handles missing images gracefully', () => {
    const result = transformProduct(makeSku({ images: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('handles missing price gracefully', () => {
    const result = transformProduct(makeSku({ jd_price: undefined }))
    expect(result.variants![0]!.price).toEqual({ amount: 0, currency: 'CNY' })
  })

  it('extracts sale_attrs as options', () => {
    const result = transformProduct(makeSku())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.name).toBe('颜色')
    expect(result.options![0]!.values).toEqual(['雅丹黑', '白沙银'])
  })

  it('omits options when no sale_attrs', () => {
    const result = transformProduct(makeSku({ sale_attrs: undefined }))
    expect(result.options).toBeUndefined()
  })
})

describe('mapProductStatus (JD.com)', () => {
  it('returns undefined for unknown status', () => {
    expect(mapProductStatus(99)).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(mapProductStatus(undefined)).toBeUndefined()
  })
})

describe('untransformProduct (JD.com)', () => {
  it('includes title and category_id', () => {
    const body = untransformProduct({
      title: '新品手机',
      productType: '555',
    })
    expect(body['title']).toBe('新品手机')
    expect(body['category_id']).toBe(555)
  })

  it('extracts price from first variant', () => {
    const body = untransformProduct({
      variants: [
        {
          id: '1',
          price: { amount: 2999, currency: 'CNY' },
          metadata: {},
        },
      ],
    })
    expect(body['jd_price']).toBe(2999)
  })

  it('extracts barcode from first variant', () => {
    const body = untransformProduct({
      variants: [
        {
          id: '1',
          price: { amount: 100, currency: 'CNY' },
          barcode: '1234567890',
          metadata: {},
        },
      ],
    })
    expect(body['upc_code']).toBe('1234567890')
  })

  it('passes through _jdExtra from metadata', () => {
    const body = untransformProduct({
      metadata: { _jdExtra: { logistics_type: 'JD_WAREHOUSE' } },
    })
    expect(body['logistics_type']).toBe('JD_WAREHOUSE')
  })
})
