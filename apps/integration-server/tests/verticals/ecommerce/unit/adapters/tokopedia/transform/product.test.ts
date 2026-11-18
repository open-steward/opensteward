import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapProductStatus,
  type RawTokopediaProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/tokopedia/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawTokopediaProduct> = {}): RawTokopediaProduct {
  return {
    basic: {
      productID: 987654321,
      shopID: 11223344,
      status: 1,
      Name: 'Batik Silk Shirt',
      condition: 1,
      childCategoryID: 5678,
      shortDesc: 'Premium handmade batik silk shirt from Solo.',
    },
    price: {
      value: 350000,
      currency: 'IDR',
      LastUpdateUnix: 1706745600,
    },
    weight: {
      value: 200,
      unit: 'GR',
    },
    pictures: [
      {
        picID: 1001,
        OriginalURL: 'https://images.tokopedia.net/img/product/1001.jpg',
        ThumbnailURL: 'https://images.tokopedia.net/img/product/1001_thumb.jpg',
        width: 800,
        height: 800,
      },
      {
        picID: 1002,
        OriginalURL: 'https://images.tokopedia.net/img/product/1002.jpg',
        ThumbnailURL: 'https://images.tokopedia.net/img/product/1002_thumb.jpg',
        width: 800,
        height: 800,
      },
    ],
    other: {
      sku: 'BSS-001',
      url: '/batik-silk-shirt',
    },
    stock: {
      value: 50,
      stockWording: 'In Stock',
    },
    createTime: '2024-01-01T00:00:00.000Z',
    updateTime: '2024-02-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformProduct (Tokopedia)', () => {
  it('uses productID as the canonical id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('987654321')
    expect(result.title).toBe('Batik Silk Shirt')
  })

  it('maps status 1 to ACTIVE', () => {
    expect(transformProduct(makeProduct()).status).toBe('ACTIVE')
  })

  it('maps status 2 to DRAFT', () => {
    const result = transformProduct(makeProduct({
      basic: { ...makeProduct().basic, status: 2 },
    }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status 3 to ARCHIVED', () => {
    const result = transformProduct(makeProduct({
      basic: { ...makeProduct().basic, status: 3 },
    }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps status 0 to DRAFT (pending/banned)', () => {
    const result = transformProduct(makeProduct({
      basic: { ...makeProduct().basic, status: 0 },
    }))
    expect(result.status).toBe('DRAFT')
  })

  it('extracts images with positions and ids', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      id: '1001',
      url: 'https://images.tokopedia.net/img/product/1001.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      id: '1002',
      url: 'https://images.tokopedia.net/img/product/1002.jpg',
      position: 1,
    })
  })

  it('maps childCategoryID as productType', () => {
    const result = transformProduct(makeProduct())
    expect(result.productType).toBe('5678')
  })

  it('creates a default variant with price info', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.price).toEqual({ amount: 350000, currency: 'IDR' })
    expect(result.variants![0]!.sku).toBe('BSS-001')
  })

  it('uses campaign discounted price when available', () => {
    const result = transformProduct(makeProduct({
      campaign: {
        discountedPrice: 280000,
        originalPrice: 350000,
        discountPercentage: 20,
      },
    }))
    expect(result.variants![0]!.price).toEqual({ amount: 280000, currency: 'IDR' })
    expect(result.variants![0]!.compareAtPrice).toEqual({ amount: 350000, currency: 'IDR' })
  })

  it('omits compareAtPrice when no campaign', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants![0]!.compareAtPrice).toBeUndefined()
  })

  it('maps weight with GR unit to g', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants![0]!.weight).toBe(200)
    expect(result.variants![0]!.weightUnit).toBe('g')
  })

  it('maps handle from url', () => {
    const result = transformProduct(makeProduct())
    expect(result.handle).toBe('batik-silk-shirt')
  })

  it('preserves timestamps', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-02-01T00:00:00.000Z')
  })

  it('satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['basic']).toBeDefined()
    expect(result.metadata['price']).toBeDefined()
  })

  it('handles missing pictures gracefully', () => {
    const result = transformProduct(makeProduct({ pictures: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('handles missing price gracefully', () => {
    const result = transformProduct(makeProduct({ price: undefined }))
    expect(result.variants![0]!.price).toEqual({ amount: 0, currency: 'IDR' })
  })
})

describe('mapProductStatus (Tokopedia)', () => {
  it('returns undefined for unknown status', () => {
    expect(mapProductStatus(99)).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(mapProductStatus(undefined)).toBeUndefined()
  })

  it('maps negative statuses to ARCHIVED', () => {
    expect(mapProductStatus(-1)).toBe('ARCHIVED')
    expect(mapProductStatus(-2)).toBe('ARCHIVED')
  })
})

describe('untransformProduct (Tokopedia)', () => {
  it('includes Name and category_id', () => {
    const body = untransformProduct({
      title: 'New Product',
      productType: '555',
    })
    expect(body['Name']).toBe('New Product')
    expect(body['category_id']).toBe(555)
  })

  it('extracts price from first variant', () => {
    const body = untransformProduct({
      variants: [
        {
          id: '1',
          price: { amount: 250000, currency: 'IDR' },
          metadata: {},
        },
      ],
    })
    expect(body['price']).toBe(250000)
    expect(body['price_currency']).toBe('IDR')
  })

  it('extracts sku from first variant', () => {
    const body = untransformProduct({
      variants: [
        {
          id: '1',
          sku: 'TEST-SKU',
          price: { amount: 100, currency: 'IDR' },
          metadata: {},
        },
      ],
    })
    expect(body['sku']).toBe('TEST-SKU')
  })

  it('maps images to pictures', () => {
    const body = untransformProduct({
      images: [
        { url: 'https://example.com/img1.jpg' },
        { url: 'https://example.com/img2.jpg' },
      ],
    })
    expect(body['pictures']).toEqual([
      { file_path: 'https://example.com/img1.jpg' },
      { file_path: 'https://example.com/img2.jpg' },
    ])
  })

  it('passes through _tokopediaExtra from metadata', () => {
    const body = untransformProduct({
      metadata: { _tokopediaExtra: { wholesale: [{ min_qty: 10, price: 300000 }] } },
    })
    expect(body['wholesale']).toEqual([{ min_qty: 10, price: 300000 }])
  })

  it('maps weight with g unit to GR', () => {
    const body = untransformProduct({
      variants: [
        {
          id: '1',
          weight: 200,
          weightUnit: 'g',
          price: { amount: 100, currency: 'IDR' },
          metadata: {},
        },
      ],
    })
    expect(body['weight']).toBe(200)
    expect(body['weight_unit']).toBe('GR')
  })
})
