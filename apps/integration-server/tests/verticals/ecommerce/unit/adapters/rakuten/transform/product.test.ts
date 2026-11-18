import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapProductStatus,
  type RakutenItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/rakuten/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeItem(overrides: Partial<RakutenItem> = {}): RakutenItem {
  return {
    itemUrl: 'my-shop/awesome-headphones',
    itemName: 'Awesome Noise-Cancelling Headphones',
    itemPrice: 12800,
    itemCaption: '<p>Premium headphones with 40h battery life.</p>',
    itemStatus: 0,
    genreId: '100371',
    catalogId: '4901234567890',
    shopCode: 'my-shop',
    manageNumber: 'HDPH-001',
    catchCopy: 'ノイズキャンセリング',
    images: [
      { url: 'https://image.rakuten.co.jp/my-shop/cabinet/img001.jpg', imageNo: 1 },
      { url: 'https://image.rakuten.co.jp/my-shop/cabinet/img002.jpg', imageNo: 2 },
    ],
    inventory: { remainingCount: 50, normalInventoryStock: 100 },
    itemWeight: 250,
    registrationDatetime: '2024-01-15T09:00:00+09:00',
    updateDatetime: '2024-03-01T12:00:00+09:00',
    taxRate: 10,
    ...overrides,
  }
}

describe('transformProduct (Rakuten)', () => {
  it('uses itemUrl as the canonical id', () => {
    const result = transformProduct(makeItem())
    expect(result.id).toBe('my-shop/awesome-headphones')
  })

  it('maps itemName to title', () => {
    const result = transformProduct(makeItem())
    expect(result.title).toBe('Awesome Noise-Cancelling Headphones')
  })

  it('falls back to itemUrl as title when itemName is absent', () => {
    const result = transformProduct(makeItem({ itemName: undefined }))
    expect(result.title).toBe('my-shop/awesome-headphones')
  })

  it('maps itemStatus 0 to ACTIVE', () => {
    expect(transformProduct(makeItem({ itemStatus: 0 })).status).toBe('ACTIVE')
  })

  it('maps itemStatus 1 to DRAFT (sold out)', () => {
    expect(transformProduct(makeItem({ itemStatus: 1 })).status).toBe('DRAFT')
  })

  it('maps itemStatus 2 to ARCHIVED (not displayed)', () => {
    expect(transformProduct(makeItem({ itemStatus: 2 })).status).toBe('ARCHIVED')
  })

  it('maps undefined itemStatus to undefined', () => {
    expect(transformProduct(makeItem({ itemStatus: undefined })).status).toBeUndefined()
  })

  it('maps genreId to productType string', () => {
    const result = transformProduct(makeItem())
    expect(result.productType).toBe('100371')
  })

  it('maps shopCode to vendor', () => {
    const result = transformProduct(makeItem())
    expect(result.vendor).toBe('my-shop')
  })

  it('maps catchCopy to tags array', () => {
    const result = transformProduct(makeItem())
    expect(result.tags).toEqual(['ノイズキャンセリング'])
  })

  it('omits tags when catchCopy is absent', () => {
    const result = transformProduct(makeItem({ catchCopy: undefined }))
    expect(result.tags).toBeUndefined()
  })

  it('extracts images with positions', () => {
    const result = transformProduct(makeItem())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://image.rakuten.co.jp/my-shop/cabinet/img001.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://image.rakuten.co.jp/my-shop/cabinet/img002.jpg',
      position: 1,
    })
  })

  it('omits images when array is empty', () => {
    const result = transformProduct(makeItem({ images: [] }))
    expect(result.images).toBeUndefined()
  })

  it('omits images when field is absent', () => {
    const result = transformProduct(makeItem({ images: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('creates a default variant with price in JPY', () => {
    const result = transformProduct(makeItem())
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.price).toEqual({ amount: 12800, currency: 'JPY' })
  })

  it('uses manageNumber as variant sku', () => {
    const result = transformProduct(makeItem())
    expect(result.variants![0]!.sku).toBe('HDPH-001')
  })

  it('falls back to catalogId as sku when manageNumber absent', () => {
    const result = transformProduct(makeItem({ manageNumber: undefined }))
    expect(result.variants![0]!.sku).toBe('4901234567890')
  })

  it('sets variant weight in grams', () => {
    const result = transformProduct(makeItem())
    expect(result.variants![0]!.weight).toBe(250)
    expect(result.variants![0]!.weightUnit).toBe('g')
  })

  it('builds handle from last segment of itemUrl', () => {
    const result = transformProduct(makeItem())
    expect(result.handle).toBe('awesome-headphones')
  })

  it('handles itemUrl with no slash as handle', () => {
    const result = transformProduct(makeItem({ itemUrl: 'simple-item-slug' }))
    expect(result.handle).toBe('simple-item-slug')
    expect(result.id).toBe('simple-item-slug')
  })

  it('preserves raw object in metadata', () => {
    const raw = makeItem()
    const result = transformProduct(raw)
    expect(result.metadata['itemUrl']).toBe('my-shop/awesome-headphones')
    expect(result.metadata['itemPrice']).toBe(12800)
    expect(result.metadata['taxRate']).toBe(10)
  })

  it('satisfies ProductSchema', () => {
    const result = transformProduct(makeItem())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('includes timestamp strings as-is', () => {
    const result = transformProduct(makeItem())
    expect(result.createdAt).toBe('2024-01-15T09:00:00+09:00')
    expect(result.updatedAt).toBe('2024-03-01T12:00:00+09:00')
  })

  it('handles zero price', () => {
    const result = transformProduct(makeItem({ itemPrice: 0 }))
    expect(result.variants![0]!.price.amount).toBe(0)
  })
})

describe('mapProductStatus (Rakuten)', () => {
  it('maps 0 to ACTIVE', () => {
    expect(mapProductStatus(0)).toBe('ACTIVE')
  })

  it('maps 1 to DRAFT', () => {
    expect(mapProductStatus(1)).toBe('DRAFT')
  })

  it('maps 2 to ARCHIVED', () => {
    expect(mapProductStatus(2)).toBe('ARCHIVED')
  })

  it('maps undefined to undefined', () => {
    expect(mapProductStatus(undefined)).toBeUndefined()
  })

  it('maps unknown values to undefined', () => {
    expect(mapProductStatus(99)).toBeUndefined()
  })
})

describe('untransformProduct (Rakuten)', () => {
  it('maps title to itemName', () => {
    const body = untransformProduct({ title: 'Great Product' })
    expect(body['itemName']).toBe('Great Product')
  })

  it('maps description to itemCaption', () => {
    const body = untransformProduct({ description: '<p>Great description</p>' })
    expect(body['itemCaption']).toBe('<p>Great description</p>')
  })

  it('maps variant price (rounded) to itemPrice', () => {
    const body = untransformProduct({
      variants: [{ id: '1', price: { amount: 9800.5, currency: 'JPY' }, metadata: {} }],
    })
    expect(body['itemPrice']).toBe(9801)
  })

  it('maps variant sku to manageNumber', () => {
    const body = untransformProduct({
      variants: [{ id: '1', sku: 'SKU-123', price: { amount: 100, currency: 'JPY' }, metadata: {} }],
    })
    expect(body['manageNumber']).toBe('SKU-123')
  })

  it('maps productType to genreId', () => {
    const body = untransformProduct({ productType: '555' })
    expect(body['genreId']).toBe('555')
  })

  it('maps first tag to catchCopy', () => {
    const body = untransformProduct({ tags: ['sale', 'summer'] })
    expect(body['catchCopy']).toBe('sale')
  })

  it('maps ACTIVE status to itemStatus 0', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body['itemStatus']).toBe(0)
  })

  it('maps DRAFT status to itemStatus 1', () => {
    const body = untransformProduct({ status: 'DRAFT' })
    expect(body['itemStatus']).toBe(1)
  })

  it('maps ARCHIVED status to itemStatus 2', () => {
    const body = untransformProduct({ status: 'ARCHIVED' })
    expect(body['itemStatus']).toBe(2)
  })

  it('maps images to array with imageNo', () => {
    const body = untransformProduct({
      images: [
        { url: 'https://example.com/img1.jpg' },
        { url: 'https://example.com/img2.jpg' },
      ],
    })
    const images = body['images'] as Array<{ url: string; imageNo: number }>
    expect(images).toHaveLength(2)
    expect(images[0]!.imageNo).toBe(1)
    expect(images[1]!.imageNo).toBe(2)
  })

  it('produces empty object for empty input', () => {
    const body = untransformProduct({})
    expect(Object.keys(body)).toHaveLength(0)
  })
})
