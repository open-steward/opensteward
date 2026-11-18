import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawWalmartItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/walmart/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RawWalmartItem> = {}): RawWalmartItem {
  return {
    sku: 'WM-WIDGET-001',
    wpid: 'WPID123456',
    upc: '012345678901',
    productName: 'Premium Stainless Steel Widget',
    shortDescription: '<p>A high-quality stainless steel widget for everyday use.</p>',
    brand: 'WidgetCo',
    productType: 'Home & Kitchen',
    shelf: 'Kitchen Tools',
    publishedStatus: 'PUBLISHED',
    lifecycleStatus: 'ACTIVE',
    price: { currency: 'USD', amount: 29.99 },
    mainImageUrl: 'https://i5.walmartimages.com/asr/widget-main.jpg',
    additionalImageUrls: [
      'https://i5.walmartimages.com/asr/widget-side.jpg',
      'https://i5.walmartimages.com/asr/widget-back.jpg',
    ],
    ...overrides,
  }
}

describe('transformProduct (Walmart)', () => {
  it('uses the SKU as the canonical id', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('WM-WIDGET-001')
    expect(result.title).toBe('Premium Stainless Steel Widget')
  })

  it('surfaces brand as vendor and productType', () => {
    const result = transformProduct(makeItem())
    expect(result.vendor).toBe('WidgetCo')
    expect(result.productType).toBe('Home & Kitchen')
  })

  it('falls back to shelf when productType is missing', () => {
    const result = transformProduct(makeItem({ productType: undefined }))
    expect(result.productType).toBe('Kitchen Tools')
  })

  it('maps PUBLISHED items to ACTIVE status', () => {
    expect(transformProduct(makeItem()).status).toBe('ACTIVE')
  })

  it('maps UNPUBLISHED items to DRAFT status', () => {
    const result = transformProduct(makeItem({ publishedStatus: 'UNPUBLISHED' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps RETIRED lifecycle to ARCHIVED status', () => {
    const result = transformProduct(makeItem({ lifecycleStatus: 'RETIRED' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('extracts images from mainImageUrl + additionalImageUrls', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toHaveLength(3)
    expect(result.images![0]).toMatchObject({
      url: 'https://i5.walmartimages.com/asr/widget-main.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://i5.walmartimages.com/asr/widget-side.jpg',
      position: 1,
    })
  })

  it('prefers structured images array when present', () => {
    const result = transformProduct(
      makeItem({
        images: [
          { url: 'https://images.example.com/structured.jpg', rank: 0 },
        ],
        mainImageUrl: 'https://images.example.com/fallback.jpg',
      }),
    )
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://images.example.com/structured.jpg')
  })

  it('returns undefined images when none are present', () => {
    const result = transformProduct(
      makeItem({
        mainImageUrl: undefined,
        additionalImageUrls: undefined,
        images: undefined,
      }),
    )
    expect(result.images).toBeUndefined()
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['sku']).toBe('WM-WIDGET-001')
    expect(result.metadata['wpid']).toBe('WPID123456')
  })

  it('round-trips title into a Walmart product body via untransformProduct', () => {
    const canonical = transformProduct(makeItem())
    const body = untransformProduct(canonical)
    expect(body['productName']).toBe('Premium Stainless Steel Widget')
    expect(body['brand']).toBe('WidgetCo')
    expect(body['mainImageUrl']).toBe('https://i5.walmartimages.com/asr/widget-main.jpg')
    expect(body['additionalImageUrls']).toHaveLength(2)
  })

  it('preserves price and upc from metadata in untransformProduct', () => {
    const canonical = transformProduct(makeItem())
    const body = untransformProduct(canonical)
    expect(body['upc']).toBe('012345678901')
    expect(body['price']).toEqual({ currency: 'USD', amount: 29.99 })
  })
})
