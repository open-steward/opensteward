import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  parseFacebookPrice,
  type RawFacebookProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/facebook-shop/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawFacebookProduct> = {}): RawFacebookProduct {
  return {
    id: '1234567890',
    name: 'Vintage Leather Bag',
    description: 'A premium vintage leather messenger bag.',
    price: '59.99 USD',
    currency: 'USD',
    image_url: 'https://scontent.xx.fbcdn.net/v/bag-main.jpg',
    additional_image_urls: [
      'https://scontent.xx.fbcdn.net/v/bag-side.jpg',
      'https://scontent.xx.fbcdn.net/v/bag-back.jpg',
    ],
    url: 'https://example.com/products/vintage-leather-bag',
    brand: 'LeatherCraft',
    category: 'Bags & Luggage',
    availability: 'in stock',
    condition: 'new',
    retailer_id: 'VLB-001',
    retailer_product_group_id: 'GRP-001',
    review_status: 'approved',
    inventory: 25,
    ...overrides,
  }
}

describe('transformProduct (Facebook Shop)', () => {
  it('uses the Graph API id as the canonical id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('1234567890')
    expect(result.title).toBe('Vintage Leather Bag')
  })

  it('surfaces brand as vendor and category as productType', () => {
    const result = transformProduct(makeProduct())
    expect(result.vendor).toBe('LeatherCraft')
    expect(result.productType).toBe('Bags & Luggage')
  })

  it('maps "in stock" availability to ACTIVE status', () => {
    expect(transformProduct(makeProduct()).status).toBe('ACTIVE')
  })

  it('maps "out of stock" availability to ACTIVE status', () => {
    const result = transformProduct(makeProduct({ availability: 'out of stock' }))
    expect(result.status).toBe('ACTIVE')
  })

  it('maps "discontinued" availability to ARCHIVED status', () => {
    const result = transformProduct(makeProduct({ availability: 'discontinued' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps "pending" availability to DRAFT status', () => {
    const result = transformProduct(makeProduct({ availability: 'pending' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps rejected review_status to DRAFT regardless of availability', () => {
    const result = transformProduct(
      makeProduct({ availability: 'in stock', review_status: 'rejected' }),
    )
    expect(result.status).toBe('DRAFT')
  })

  it('extracts primary and additional images with positions', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(3)
    expect(result.images![0]).toMatchObject({
      url: 'https://scontent.xx.fbcdn.net/v/bag-main.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://scontent.xx.fbcdn.net/v/bag-side.jpg',
      position: 1,
    })
    expect(result.images![2]).toMatchObject({
      url: 'https://scontent.xx.fbcdn.net/v/bag-back.jpg',
      position: 2,
    })
  })

  it('handles products with no images', () => {
    const result = transformProduct(
      makeProduct({ image_url: undefined, additional_image_urls: undefined }),
    )
    expect(result.images).toBeUndefined()
  })

  it('produces a payload that satisfies ProductSchema and preserves raw in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(() => ProductSchema.parse(result)).not.toThrow()
    expect(result.metadata['id']).toBe('1234567890')
    expect(result.metadata['retailer_id']).toBe('VLB-001')
  })

  it('round-trips title into a Facebook product body via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body['name']).toBe('Vintage Leather Bag')
    expect(body['brand']).toBe('LeatherCraft')
    expect(body['category']).toBe('Bags & Luggage')
    expect(body['image_url']).toBe('https://scontent.xx.fbcdn.net/v/bag-main.jpg')
  })

  it('maps ACTIVE status to "in stock" availability in untransform', () => {
    const body = untransformProduct({ status: 'ACTIVE' })
    expect(body['availability']).toBe('in stock')
  })

  it('maps ARCHIVED status to "discontinued" availability in untransform', () => {
    const body = untransformProduct({ status: 'ARCHIVED' })
    expect(body['availability']).toBe('discontinued')
  })
})

describe('parseFacebookPrice', () => {
  it('parses "59.99 USD" format', () => {
    expect(parseFacebookPrice('59.99 USD')).toEqual({ amount: 59.99, currency: 'USD' })
  })

  it('returns undefined for undefined input', () => {
    expect(parseFacebookPrice(undefined)).toBeUndefined()
  })

  it('uses currency override when price has no currency', () => {
    expect(parseFacebookPrice('29.99', 'EUR')).toEqual({ amount: 29.99, currency: 'EUR' })
  })

  it('returns undefined for non-numeric input', () => {
    expect(parseFacebookPrice('invalid')).toBeUndefined()
  })
})
