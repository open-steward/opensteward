import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapProductStatus,
  type RawTikTokProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiktok-shop/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawTikTokProduct> = {}): RawTikTokProduct {
  return {
    id: '1729384756001',
    title: 'Wireless Bluetooth Earbuds Pro',
    description: '<p>Premium wireless earbuds with active noise cancellation.</p>',
    status: 4, // live
    brand: { id: 'brand-99', name: 'TechSound' },
    category_chains: [
      { id: '100', local_name: 'Electronics', is_leaf: false },
      { id: '200', local_name: 'Audio', is_leaf: true },
    ],
    main_images: [
      {
        urls: ['https://p16-oec-va.ibyteimg.com/img1.jpg'],
        uri: 'img-001',
        width: 800,
        height: 800,
      },
      {
        urls: ['https://p16-oec-va.ibyteimg.com/img2.jpg'],
        uri: 'img-002',
        width: 800,
        height: 800,
      },
    ],
    skus: [
      {
        id: 'sku-001',
        seller_sku: 'WBE-PRO-BLK',
        price: {
          currency: 'USD',
          original_price: '59.99',
          sale_price: '49.99',
        },
        sales_attributes: [
          { id: 'attr-1', name: 'Color', value_id: 'val-1', value_name: 'Black' },
        ],
      },
    ],
    create_time: 1704067200, // 2024-01-01T00:00:00Z
    update_time: 1706745600, // 2024-02-01T00:00:00Z
    ...overrides,
  }
}

describe('transformProduct (TikTok Shop)', () => {
  it('uses product id as the canonical id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('1729384756001')
    expect(result.title).toBe('Wireless Bluetooth Earbuds Pro')
  })

  it('maps status 4 (live) to ACTIVE', () => {
    expect(transformProduct(makeProduct()).status).toBe('ACTIVE')
  })

  it('maps status 1 (draft) to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 1 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status 5 (seller_deactivated) to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 5 }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps status 6 (platform_deactivated) to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 6 }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('extracts images with positions and URIs', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      id: 'img-001',
      url: 'https://p16-oec-va.ibyteimg.com/img1.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      id: 'img-002',
      url: 'https://p16-oec-va.ibyteimg.com/img2.jpg',
      position: 1,
    })
  })

  it('surfaces brand as vendor and leaf category as productType', () => {
    const result = transformProduct(makeProduct())
    expect(result.vendor).toBe('TechSound')
    expect(result.productType).toBe('Audio')
  })

  it('creates variants from SKUs with price info', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(result.variants![0]!.compareAtPrice).toEqual({ amount: 5999, currency: 'USD' })
  })

  it('omits compareAtPrice when sale equals original', () => {
    const result = transformProduct(
      makeProduct({
        skus: [{
          id: 'sku-1',
          price: { currency: 'USD', original_price: '49.99', sale_price: '49.99' },
        }],
      }),
    )
    expect(result.variants![0]!.compareAtPrice).toBeUndefined()
  })

  it('converts Unix timestamps to ISO strings', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['id']).toBe('1729384756001')
  })

  it('handles missing skus gracefully', () => {
    const result = transformProduct(makeProduct({ skus: undefined }))
    expect(result.variants).toBeUndefined()
  })

  it('handles missing images gracefully', () => {
    const result = transformProduct(makeProduct({ main_images: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('extracts sales attributes as option values', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants![0]!.optionValues).toEqual({ Color: 'Black' })
    expect(result.variants![0]!.title).toBe('Black')
  })
})

describe('mapProductStatus (TikTok Shop)', () => {
  it('returns undefined for unknown status', () => {
    expect(mapProductStatus(99)).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(mapProductStatus(undefined)).toBeUndefined()
  })

  it('maps all deactivated/failed statuses to ARCHIVED', () => {
    expect(mapProductStatus(2)).toBe('ARCHIVED') // pending
    expect(mapProductStatus(3)).toBe('ARCHIVED') // failed
    expect(mapProductStatus(7)).toBe('ARCHIVED') // freeze
  })
})

describe('untransformProduct (TikTok Shop)', () => {
  it('includes title and category_id', () => {
    const body = untransformProduct({
      title: 'New Product',
      productType: 'Electronics',
    })
    expect(body['title']).toBe('New Product')
    expect(body['category_id']).toBe('Electronics')
  })

  it('extracts SKUs from variants', () => {
    const body = untransformProduct({
      variants: [
        {
          id: '1',
          sku: 'SKU-001',
          price: { amount: 29.99, currency: 'USD' },
          metadata: {},
        },
      ],
    })
    expect(body['skus']).toHaveLength(1)
  })

  it('passes through _tiktokExtra from metadata', () => {
    const body = untransformProduct({
      metadata: { _tiktokExtra: { package_weight: { value: '500', unit: 'GRAM' } } },
    })
    expect(body['package_weight']).toEqual({ value: '500', unit: 'GRAM' })
  })
})
