import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapProductStatus,
  type RawDarazProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/daraz/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRaw(overrides: Partial<RawDarazProduct> = {}): RawDarazProduct {
  return {
    item_id: 123456789,
    primary_category: 5678,
    attributes: {
      name: 'Wireless Bluetooth Earbuds',
      description: '<p>Premium sound quality earbuds</p>',
      short_description: 'Bluetooth earbuds',
      brand: 'TechAudio',
    },
    skus: [
      {
        SkuId: 901,
        SellerSku: 'EARBUDS-BLK',
        ShopSku: 'EARBUDS-BLK-PK',
        price: '29.99',
        special_price: '24.99',
        quantity: 100,
        package_weight: '0.15',
        Status: 'active',
        Images: ['https://img.daraz.pk/earbuds-1.jpg'],
      },
      {
        SkuId: 902,
        SellerSku: 'EARBUDS-WHT',
        price: '29.99',
        quantity: 50,
        Status: 'active',
      },
    ],
    images: [
      'https://img.daraz.pk/product-main.jpg',
      'https://img.daraz.pk/product-alt.jpg',
    ],
    status: 'active',
    created_time: '2024-06-01T08:00:00Z',
    updated_time: '2024-06-15T10:30:00Z',
    ...overrides,
  }
}

describe('transformProduct (Daraz)', () => {
  it('uses item_id as the canonical id', () => {
    const result = transformProduct(makeRaw())
    expect(result.id).toBe('123456789')
    expect(result.title).toBe('Wireless Bluetooth Earbuds')
  })

  it('maps product attributes to canonical fields', () => {
    const result = transformProduct(makeRaw())
    expect(result.description).toBe('<p>Premium sound quality earbuds</p>')
    expect(result.vendor).toBe('TechAudio')
    expect(result.productType).toBe('5678')
  })

  it('maps active status to ACTIVE', () => {
    expect(transformProduct(makeRaw()).status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    const result = transformProduct(makeRaw({ status: 'inactive' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps deleted status to ARCHIVED', () => {
    const result = transformProduct(makeRaw({ status: 'deleted' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('extracts product images with positions', () => {
    const result = transformProduct(makeRaw())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://img.daraz.pk/product-main.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://img.daraz.pk/product-alt.jpg',
      position: 1,
    })
  })

  it('maps SKUs to variants with parsed prices', () => {
    const result = transformProduct(makeRaw(), 'PKR')
    expect(result.variants).toHaveLength(2)
    const v1 = result.variants![0]!
    expect(v1.id).toBe('901')
    expect(v1.sku).toBe('EARBUDS-BLK')
    expect(v1.price).toEqual({ amount: 2999, currency: 'PKR' })
    expect(v1.compareAtPrice).toEqual({ amount: 2499, currency: 'PKR' })
    expect(v1.weight).toBe(0.15)
    expect(v1.weightUnit).toBe('kg')
  })

  it('handles missing special_price gracefully', () => {
    const result = transformProduct(makeRaw(), 'PKR')
    const v2 = result.variants![1]!
    expect(v2.compareAtPrice).toBeUndefined()
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeRaw(), 'PKR')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRaw()
    const result = transformProduct(raw)
    expect(result.metadata['item_id']).toBe(123456789)
    expect(result.metadata['status']).toBe('active')
  })

  it('handles products with no SKUs', () => {
    const result = transformProduct(makeRaw({ skus: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('handles products with no images', () => {
    const result = transformProduct(makeRaw({ images: undefined }))
    expect(result.images).toBeUndefined()
  })
})

describe('mapProductStatus (Daraz)', () => {
  it('returns undefined for unknown statuses', () => {
    expect(mapProductStatus('foo')).toBeUndefined()
    expect(mapProductStatus(undefined)).toBeUndefined()
  })
})

describe('untransformProduct (Daraz)', () => {
  it('produces a Daraz-shaped payload from canonical product', () => {
    const canonical = transformProduct(makeRaw(), 'PKR')
    const body = untransformProduct(canonical)
    const req = body['Request'] as Record<string, unknown>
    const product = req['Product'] as Record<string, unknown>
    expect(product['Attributes']).toMatchObject({
      name: 'Wireless Bluetooth Earbuds',
    })
  })

  it('maps variants to Daraz Sku array', () => {
    const canonical = transformProduct(makeRaw(), 'PKR')
    const body = untransformProduct(canonical)
    const req = body['Request'] as Record<string, unknown>
    const product = req['Product'] as Record<string, unknown>
    const skus = product['Skus'] as Record<string, unknown>
    const skuArray = skus['Sku'] as Array<Record<string, unknown>>
    expect(skuArray).toHaveLength(2)
    expect(skuArray[0]!['SellerSku']).toBe('EARBUDS-BLK')
  })

  it('maps images to Daraz Image array', () => {
    const canonical = transformProduct(makeRaw(), 'PKR')
    const body = untransformProduct(canonical)
    const req = body['Request'] as Record<string, unknown>
    const product = req['Product'] as Record<string, unknown>
    const images = product['Images'] as Record<string, unknown>
    const imageArray = images['Image'] as Array<Record<string, unknown>>
    expect(imageArray).toHaveLength(2)
    expect(imageArray[0]!['Url']).toBe('https://img.daraz.pk/product-main.jpg')
  })

  it('handles product with no variants', () => {
    const body = untransformProduct({ title: 'Test' })
    const req = body['Request'] as Record<string, unknown>
    const product = req['Product'] as Record<string, unknown>
    const skus = product['Skus'] as Record<string, unknown>
    expect(skus['Sku']).toBeUndefined()
  })

  it('handles product with no images', () => {
    const body = untransformProduct({ title: 'Test' })
    const req = body['Request'] as Record<string, unknown>
    const product = req['Product'] as Record<string, unknown>
    expect(product['Images']).toBeUndefined()
  })
})
