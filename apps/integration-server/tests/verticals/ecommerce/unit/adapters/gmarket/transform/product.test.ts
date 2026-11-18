import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawGmarketProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/gmarket/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawGmarketProduct> = {}): RawGmarketProduct {
  return {
    goodsNo: 'GM-12345',
    sellerItemCode: 'SKU-001',
    goodsName: '삼성 갤럭시 버즈 프로',
    goodsDescription: '<p>Premium wireless earbuds</p>',
    brandName: 'Samsung',
    categoryCode: 'C001',
    categoryName: 'Electronics',
    salePrice: 199000,
    currency: 'KRW',
    stockQuantity: 100,
    saleStatus: 'ON_SALE',
    imageUrls: [
      'https://img.gmarket.co.kr/aaa.jpg',
      'https://img.gmarket.co.kr/bbb.jpg',
    ],
    registDate: '2024-06-01T09:00:00.000Z',
    modifyDate: '2024-06-15T14:00:00.000Z',
    ...overrides,
  }
}

describe('transformProduct (Gmarket)', () => {
  it('uses goodsNo as the canonical id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('GM-12345')
    expect(result.title).toBe('삼성 갤럭시 버즈 프로')
  })

  it('surfaces brandName as vendor and categoryName as productType', () => {
    const result = transformProduct(makeProduct())
    expect(result.vendor).toBe('Samsung')
    expect(result.productType).toBe('Electronics')
  })

  it('maps ON_SALE to ACTIVE and STOP_SALE to ARCHIVED', () => {
    expect(transformProduct(makeProduct()).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ saleStatus: 'STOP_SALE' })).status).toBe('ARCHIVED')
    expect(transformProduct(makeProduct({ saleStatus: 'SOLD_OUT' })).status).toBe('ARCHIVED')
    expect(transformProduct(makeProduct({ saleStatus: 'WAITING' })).status).toBe('DRAFT')
  })

  it('extracts imageUrls into canonical images with positions', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://img.gmarket.co.kr/aaa.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://img.gmarket.co.kr/bbb.jpg',
      position: 1,
    })
  })

  it('prefers structured images array over flat imageUrls', () => {
    const result = transformProduct(makeProduct({
      images: [
        { imageUrl: 'https://img.gmarket.co.kr/structured.jpg', sortOrder: 5 },
      ],
      imageUrls: ['https://img.gmarket.co.kr/flat.jpg'],
    }))
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://img.gmarket.co.kr/structured.jpg')
    expect(result.images![0]!.position).toBe(5)
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['goodsNo']).toBe('GM-12345')
    expect(result.metadata['salePrice']).toBe(199000)
  })

  it('round-trips title into a Gmarket product body via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body['goodsName']).toBe('삼성 갤럭시 버즈 프로')
    expect(body['brandName']).toBe('Samsung')
  })

  it('falls back to goodsNo as title when goodsName is missing', () => {
    const result = transformProduct(makeProduct({ goodsName: undefined }))
    expect(result.title).toBe('GM-12345')
  })
})
