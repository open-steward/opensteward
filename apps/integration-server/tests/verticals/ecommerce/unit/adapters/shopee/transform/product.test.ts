import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapProductStatus,
  type RawShopeeItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopee/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawShopeeItem> = {}): RawShopeeItem {
  return {
    item_id: 100200300,
    category_id: 12345,
    item_name: 'Wireless Bluetooth Earbuds',
    item_sku: 'WBE-001',
    description: '<p>Premium wireless earbuds with noise cancellation.</p>',
    item_status: 'NORMAL',
    brand: { brand_id: 99, original_brand_name: 'TechSound' },
    price_info: [
      {
        currency: 'SGD',
        original_price: 59.9,
        current_price: 49.9,
      },
    ],
    image: {
      image_url_list: [
        'https://cf.shopee.sg/file/abc123_main.jpg',
        'https://cf.shopee.sg/file/abc123_side.jpg',
      ],
      image_id_list: ['img-001', 'img-002'],
    },
    weight: 0.15,
    create_time: 1704067200, // 2024-01-01T00:00:00Z
    update_time: 1706745600, // 2024-02-01T00:00:00Z
    has_model: false,
    ...overrides,
  }
}

describe('transformProduct (Shopee)', () => {
  it('uses item_id as the canonical id', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('100200300')
    expect(result.title).toBe('Wireless Bluetooth Earbuds')
  })

  it('maps NORMAL status to ACTIVE', () => {
    expect(transformProduct(makeItem()).status).toBe('ACTIVE')
  })

  it('maps BANNED status to ARCHIVED', () => {
    const result = transformProduct(makeItem({ item_status: 'BANNED' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps UNLIST status to DRAFT', () => {
    const result = transformProduct(makeItem({ item_status: 'UNLIST' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps DELETED status to ARCHIVED', () => {
    const result = transformProduct(makeItem({ item_status: 'DELETED' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('extracts images with positions and ids', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      id: 'img-001',
      url: 'https://cf.shopee.sg/file/abc123_main.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      id: 'img-002',
      url: 'https://cf.shopee.sg/file/abc123_side.jpg',
      position: 1,
    })
  })

  it('surfaces brand as vendor and category_id as productType', () => {
    const result = transformProduct(makeItem())
    expect(result.vendor).toBe('TechSound')
    expect(result.productType).toBe('12345')
  })

  it('creates a default variant with price info', () => {
    const result = transformProduct(makeItem())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.price).toEqual({ amount: 4990, currency: 'SGD' })
    expect(result.variants![0]!.compareAtPrice).toEqual({ amount: 5990, currency: 'SGD' })
  })

  it('omits compareAtPrice when current equals original', () => {
    const result = transformProduct(
      makeItem({
        price_info: [{ currency: 'SGD', original_price: 49.9, current_price: 49.9 }],
      }),
    )
    expect(result.variants![0]!.compareAtPrice).toBeUndefined()
  })

  it('converts Unix timestamps to ISO strings', () => {
    const result = transformProduct(makeItem())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['item_id']).toBe(100200300)
    expect(result.metadata['item_sku']).toBe('WBE-001')
  })

  it('handles missing price_info gracefully', () => {
    const result = transformProduct(makeItem({ price_info: undefined }))
    expect(result.variants).toBeUndefined()
  })

  it('handles missing images gracefully', () => {
    const result = transformProduct(makeItem({ image: undefined }))
    expect(result.images).toBeUndefined()
  })
})

describe('mapProductStatus (Shopee)', () => {
  it('returns undefined for unknown status', () => {
    expect(mapProductStatus('SOMETHING_ELSE')).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(mapProductStatus(undefined)).toBeUndefined()
  })

  it('is case-insensitive', () => {
    expect(mapProductStatus('normal')).toBe('ACTIVE')
    expect(mapProductStatus('Normal')).toBe('ACTIVE')
  })
})

describe('untransformProduct (Shopee)', () => {
  it('includes item_name and category_id', () => {
    const body = untransformProduct({
      title: 'New Product',
      productType: '555',
    })
    expect(body['item_name']).toBe('New Product')
    expect(body['category_id']).toBe(555)
  })

  it('extracts price from first variant', () => {
    const body = untransformProduct({
      variants: [
        {
          id: '1',
          price: { amount: 29.99, currency: 'SGD' },
          metadata: {},
        },
      ],
    })
    expect(body['original_price']).toBe(29.99)
  })

  it('passes through _shopeeExtra from metadata', () => {
    const body = untransformProduct({
      metadata: { _shopeeExtra: { logistics: [{ logistic_id: 1 }] } },
    })
    expect(body['logistics']).toEqual([{ logistic_id: 1 }])
  })
})
