import { describe, it, expect } from 'vitest'
import {
  transformProductDetail,
  transformProductSummary,
  type RawNhnProductDetail,
  type RawNhnProductSummary,
} from '../../../../../../../src/verticals/ecommerce/adapters/nhn-commerce/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeDetail(overrides: Partial<RawNhnProductDetail> = {}): RawNhnProductDetail {
  return {
    baseInfo: {
      productNo: 555,
      productName: 'Wireless Headphones',
      content: '<p>Premium sound.</p>',
      imageUrls: ['//cdn.example.com/wh1.jpg', '//cdn.example.com/wh2.jpg'],
      saleStatusType: 'ONSALE',
      brandName: 'SoundCo',
      productType: 'ELECTRONICS',
      registerYmdt: '2024-03-01T00:00:00Z',
      saleStartYmdt: '2024-03-01T00:00:00Z',
    },
    options: [
      {
        optionNo: 10001,
        optionName: 'Color',
        optionValue: 'Black',
        stockCnt: 20,
        price: { salePrice: 50000, standardAmt: 60000, buyAmt: 50000 },
        sku: 'WH-BLK',
      },
      {
        optionNo: 10002,
        optionName: 'Color',
        optionValue: 'White',
        stockCnt: 15,
        price: { salePrice: 50000, standardAmt: 60000, buyAmt: 50000 },
        sku: 'WH-WHT',
      },
    ],
    ...overrides,
  }
}

function makeSummary(overrides: Partial<RawNhnProductSummary> = {}): RawNhnProductSummary {
  return {
    productNo: 666,
    productName: 'USB-C Cable',
    salePrice: 9900,
    saleStatusType: 'ONSALE',
    brandName: 'TechCo',
    imageUrl: '//cdn.example.com/cable.jpg',
    ...overrides,
  }
}

describe('transformProductDetail (NHN Commerce)', () => {
  it('maps productNo to string canonical id', () => {
    const result = transformProductDetail(makeDetail())
    expect(result.id).toBe('555')
  })

  it('maps productName to title', () => {
    const result = transformProductDetail(makeDetail())
    expect(result.title).toBe('Wireless Headphones')
  })

  it('maps ONSALE to ACTIVE status', () => {
    const result = transformProductDetail(makeDetail())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps SOLDOUT to ARCHIVED status', () => {
    const result = transformProductDetail(
      makeDetail({ baseInfo: { ...makeDetail().baseInfo, saleStatusType: 'SOLDOUT' } }),
    )
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps brandName to vendor', () => {
    const result = transformProductDetail(makeDetail())
    expect(result.vendor).toBe('SoundCo')
  })

  it('maps options to variants', () => {
    const result = transformProductDetail(makeDetail())
    expect(result.variants).toHaveLength(2)
    const v = result.variants![0]!
    expect(v.id).toBe('10001')
    expect(v.productId).toBe('555')
    // KRW 0 decimal digits → 50000 stays 50000
    expect(v.price).toEqual({ amount: 50000, currency: 'KRW' })
    expect(v.sku).toBe('WH-BLK')
    expect(v.optionValues).toEqual({ Color: 'Black' })
  })

  it('maps compareAtPrice when standardAmt > salePrice', () => {
    const result = transformProductDetail(makeDetail())
    expect(result.variants![0]!.compareAtPrice).toEqual({ amount: 60000, currency: 'KRW' })
  })

  it('prepends https: to protocol-relative imageUrls', () => {
    const result = transformProductDetail(makeDetail())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/wh1.jpg')
  })

  it('maps registerYmdt to createdAt', () => {
    const result = transformProductDetail(makeDetail())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProductDetail(makeDetail())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('transformProductSummary (NHN Commerce)', () => {
  it('maps productNo to string id and productName to title', () => {
    const result = transformProductSummary(makeSummary())
    expect(result.id).toBe('666')
    expect(result.title).toBe('USB-C Cable')
  })

  it('maps salePrice to variant price in KRW', () => {
    const result = transformProductSummary(makeSummary())
    expect(result.variants![0]!.price).toEqual({ amount: 9900, currency: 'KRW' })
  })

  it('prepends https: to protocol-relative imageUrl', () => {
    const result = transformProductSummary(makeSummary())
    expect(result.images![0]!.url).toBe('https://cdn.example.com/cable.jpg')
  })

  it('maps brandName to vendor', () => {
    const result = transformProductSummary(makeSummary())
    expect(result.vendor).toBe('TechCo')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProductSummary(makeSummary())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
