import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapProductStatus,
  type RawJumiaProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/jumia/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawJumiaProduct> = {}): RawJumiaProduct {
  return {
    product_id: 987654,
    name: 'Samsung Galaxy Earbuds Pro',
    description: '<p>Premium wireless earbuds with ANC</p>',
    short_description: 'Galaxy Earbuds Pro',
    brand: 'Samsung',
    category_id: 1234,
    primary_category: 'Electronics',
    status: 'active',
    images: [
      'https://images.jumia.com.ng/earbuds-main.jpg',
      'https://images.jumia.com.ng/earbuds-alt.jpg',
    ],
    variations: [
      {
        sku_id: 'V001',
        seller_sku: 'EARBUDS-BLK',
        name: 'Black',
        price: 45000,
        sale_price: 39999,
        quantity: 200,
        package_weight: '0.12',
        status: 'active',
        color_family: 'Black',
        size: 'One Size',
      },
      {
        sku_id: 'V002',
        seller_sku: 'EARBUDS-WHT',
        name: 'White',
        price: 45000,
        quantity: 80,
        status: 'active',
        color_family: 'White',
      },
    ],
    created_at: '2024-03-10T09:00:00Z',
    updated_at: '2024-06-20T14:30:00Z',
    ...overrides,
  }
}

describe('transformProduct (Jumia)', () => {
  it('uses product_id as the canonical id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('987654')
    expect(result.title).toBe('Samsung Galaxy Earbuds Pro')
  })

  it('maps product attributes to canonical fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>Premium wireless earbuds with ANC</p>')
    expect(result.vendor).toBe('Samsung')
    expect(result.productType).toBe('Electronics')
  })

  it('falls back to category_id when primary_category is absent', () => {
    const result = transformProduct(makeProduct({ primary_category: undefined }))
    expect(result.productType).toBe('1234')
  })

  it('maps active status to ACTIVE', () => {
    expect(transformProduct(makeProduct()).status).toBe('ACTIVE')
  })

  it('maps inactive status to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 'inactive' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps deleted status to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 'deleted' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps suspended status to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 'suspended' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('extracts product images with positions', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://images.jumia.com.ng/earbuds-main.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://images.jumia.com.ng/earbuds-alt.jpg',
      position: 1,
    })
  })

  it('maps variations to variants with parsed prices', () => {
    const result = transformProduct(makeProduct(), 'NGN')
    expect(result.variants).toHaveLength(2)
    const v1 = result.variants![0]!
    expect(v1.id).toBe('V001')
    expect(v1.sku).toBe('EARBUDS-BLK')
    expect(v1.price).toEqual({ amount: 45000, currency: 'NGN' })
    expect(v1.compareAtPrice).toEqual({ amount: 39999, currency: 'NGN' })
    expect(v1.weight).toBe(0.12)
    expect(v1.weightUnit).toBe('kg')
  })

  it('maps option values from variation attributes', () => {
    const result = transformProduct(makeProduct(), 'NGN')
    const v1 = result.variants![0]!
    expect(v1.optionValues).toEqual({ color: 'Black', size: 'One Size' })
  })

  it('handles missing sale_price gracefully', () => {
    const result = transformProduct(makeProduct(), 'NGN')
    const v2 = result.variants![1]!
    expect(v2.compareAtPrice).toBeUndefined()
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct(), 'NGN')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata['product_id']).toBe(987654)
    expect(result.metadata['status']).toBe('active')
  })

  it('handles products with no variations', () => {
    const result = transformProduct(makeProduct({ variations: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('handles products with no images', () => {
    const result = transformProduct(makeProduct({ images: undefined }))
    expect(result.images).toBeUndefined()
  })
})

describe('mapProductStatus (Jumia)', () => {
  it('returns undefined for unknown statuses', () => {
    expect(mapProductStatus('foo')).toBeUndefined()
    expect(mapProductStatus(undefined)).toBeUndefined()
  })

  it('maps live to ACTIVE', () => {
    expect(mapProductStatus('live')).toBe('ACTIVE')
  })
})

describe('untransformProduct (Jumia)', () => {
  it('produces a Jumia-shaped payload from canonical product', () => {
    const canonical = transformProduct(makeProduct(), 'NGN')
    const body = untransformProduct(canonical)
    const product = body['product'] as Record<string, unknown>
    expect(product['name']).toBe('Samsung Galaxy Earbuds Pro')
    expect(product['brand']).toBe('Samsung')
  })

  it('maps variants to Jumia variations array', () => {
    const canonical = transformProduct(makeProduct(), 'NGN')
    const body = untransformProduct(canonical)
    const product = body['product'] as Record<string, unknown>
    const variations = product['variations'] as Array<Record<string, unknown>>
    expect(variations).toHaveLength(2)
    expect(variations[0]!['seller_sku']).toBe('EARBUDS-BLK')
  })
})
