import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapProductStatus,
  type RawCoupangProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/coupang/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawCoupangProduct> = {}): RawCoupangProduct {
  return {
    sellerProductId: 12345678,
    sellerProductName: '삼성 갤럭시 버즈2 무선 이어폰',
    displayCategoryCode: 56789,
    productGroupName: '전자/가전>이어폰/헤드폰',
    brand: '삼성전자',
    statusName: 'APPROVED',
    contents: '<p>최고의 무선 이어폰입니다.</p>',
    createdAt: '2024-01-15T09:00:00.000Z',
    updatedAt: '2024-03-10T14:30:00.000Z',
    items: [
      {
        vendorItemId: 987654321,
        itemName: '화이트',
        originalPrice: 129000,
        salePrice: 99000,
        externalVendorSkuCode: 'BUDS2-WHITE',
        barcode: '8806092735415',
        attributes: [{ attributeTypeName: '색상', attributeValueName: '화이트' }],
      },
      {
        vendorItemId: 987654322,
        itemName: '블랙',
        originalPrice: 129000,
        salePrice: 99000,
        externalVendorSkuCode: 'BUDS2-BLACK',
        barcode: '8806092735422',
        attributes: [{ attributeTypeName: '색상', attributeValueName: '블랙' }],
      },
    ],
    images: [
      {
        imageOrder: 0,
        imageType: 'REPRESENTATION',
        cdnPath: 'https://image8.coupangcdn.com/image/retail/mainImages/buds2-white.jpg',
      },
      {
        imageOrder: 1,
        imageType: 'DETAIL',
        cdnPath: 'https://image8.coupangcdn.com/image/retail/detail/buds2-detail.jpg',
      },
    ],
    ...overrides,
  }
}

describe('transformProduct (Coupang)', () => {
  it('uses sellerProductId as the canonical id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('12345678')
  })

  it('maps sellerProductName to title', () => {
    const result = transformProduct(makeProduct())
    expect(result.title).toBe('삼성 갤럭시 버즈2 무선 이어폰')
  })

  it('maps APPROVED status to ACTIVE', () => {
    expect(transformProduct(makeProduct({ statusName: 'APPROVED' })).status).toBe('ACTIVE')
  })

  it('maps SALE status to ACTIVE', () => {
    expect(transformProduct(makeProduct({ statusName: 'SALE' })).status).toBe('ACTIVE')
  })

  it('maps SUSPENDED status to ARCHIVED', () => {
    expect(transformProduct(makeProduct({ statusName: 'SUSPENDED' })).status).toBe('ARCHIVED')
  })

  it('maps PROHIBITED status to ARCHIVED', () => {
    expect(transformProduct(makeProduct({ statusName: 'PROHIBITED' })).status).toBe('ARCHIVED')
  })

  it('maps PENDING status to DRAFT', () => {
    expect(transformProduct(makeProduct({ statusName: 'PENDING' })).status).toBe('DRAFT')
  })

  it('maps REVIEW status to DRAFT', () => {
    expect(transformProduct(makeProduct({ statusName: 'REVIEW' })).status).toBe('DRAFT')
  })

  it('surfaces brand as vendor', () => {
    expect(transformProduct(makeProduct()).vendor).toBe('삼성전자')
  })

  it('surfaces displayCategoryCode as productType string', () => {
    expect(transformProduct(makeProduct()).productType).toBe('56789')
  })

  it('maps HTML description from contents', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>최고의 무선 이어폰입니다.</p>')
  })

  it('extracts images ordered by imageOrder', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toContain('buds2-white')
    expect(result.images![0]!.position).toBe(0)
    expect(result.images![1]!.url).toContain('buds2-detail')
    expect(result.images![1]!.position).toBe(1)
  })

  it('creates a variant per item with KRW price', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(2)
    expect(result.variants![0]!.price).toEqual({ amount: 99000, currency: 'KRW' })
    expect(result.variants![0]!.id).toBe('987654321')
  })

  it('adds compareAtPrice when original > sale', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants![0]!.compareAtPrice).toEqual({ amount: 129000, currency: 'KRW' })
  })

  it('omits compareAtPrice when price equals original', () => {
    const product = makeProduct()
    product.items![0]!.originalPrice = 99000
    product.items![0]!.salePrice = 99000
    const result = transformProduct(product)
    expect(result.variants![0]!.compareAtPrice).toBeUndefined()
  })

  it('maps SKU and barcode on variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants![0]!.sku).toBe('BUDS2-WHITE')
    expect(result.variants![0]!.barcode).toBe('8806092735415')
  })

  it('extracts optionValues from attributes', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants![0]!.optionValues).toEqual({ 색상: '화이트' })
    expect(result.variants![1]!.optionValues).toEqual({ 색상: '블랙' })
  })

  it('preserves ISO date strings', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-01-15T09:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-10T14:30:00.000Z')
  })

  it('satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeProduct()))).not.toThrow()
  })

  it('sets metadata to the complete raw object', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata['sellerProductId']).toBe(12345678)
    expect(result.metadata['brand']).toBe('삼성전자')
  })

  it('handles missing items gracefully (no variants)', () => {
    const result = transformProduct(makeProduct({ items: undefined }))
    expect(result.variants).toBeUndefined()
  })

  it('handles missing images gracefully', () => {
    const result = transformProduct(makeProduct({ images: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('uses vendorPath when cdnPath is absent', () => {
    const product = makeProduct({
      images: [
        {
          imageOrder: 0,
          imageType: 'REPRESENTATION',
          vendorPath: 'https://vendor.example.com/img.jpg',
        },
      ],
    })
    const result = transformProduct(product)
    expect(result.images![0]!.url).toBe('https://vendor.example.com/img.jpg')
  })
})

describe('mapProductStatus (Coupang)', () => {
  it('returns undefined for undefined input', () => {
    expect(mapProductStatus(undefined)).toBeUndefined()
  })

  it('returns undefined for unknown status', () => {
    expect(mapProductStatus('UNKNOWN_STATUS')).toBeUndefined()
  })

  it('is case-insensitive', () => {
    expect(mapProductStatus('approved')).toBe('ACTIVE')
    expect(mapProductStatus('Suspended')).toBe('ARCHIVED')
  })
})

describe('untransformProduct (Coupang)', () => {
  it('maps title to sellerProductName', () => {
    const body = untransformProduct({ title: 'New Product KR' })
    expect(body['sellerProductName']).toBe('New Product KR')
  })

  it('maps description to contents', () => {
    const body = untransformProduct({ description: '<p>Test</p>' })
    expect(body['contents']).toBe('<p>Test</p>')
  })

  it('maps brand to vendor', () => {
    const body = untransformProduct({ vendor: 'LG Electronics' })
    expect(body['brand']).toBe('LG Electronics')
  })

  it('maps productType to displayCategoryCode', () => {
    const body = untransformProduct({ productType: '56789' })
    expect(body['displayCategoryCode']).toBe(56789)
  })

  it('maps variants to items array', () => {
    const body = untransformProduct({
      variants: [
        {
          id: '1',
          title: '화이트',
          price: { amount: 99000, currency: 'KRW' },
          sku: 'SKU-001',
          metadata: {},
        },
      ],
    })
    const items = body['items'] as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0]!['salePrice']).toBe(99000)
    expect(items[0]!['externalVendorSkuCode']).toBe('SKU-001')
    expect(items[0]!['itemName']).toBe('화이트')
  })

  it('merges _coupangExtra from metadata', () => {
    const body = untransformProduct({
      metadata: { _coupangExtra: { deliveryMethod: 'ROCKET' } },
    })
    expect(body['deliveryMethod']).toBe('ROCKET')
  })
})
