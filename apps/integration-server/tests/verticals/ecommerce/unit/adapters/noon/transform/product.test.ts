import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  mapProductStatus,
  type RawNoonProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/noon/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawNoonProduct> = {}): RawNoonProduct {
  return {
    product_id: 'NP-12345',
    title: 'Samsung Galaxy Buds Pro',
    title_ar: '\u0633\u0627\u0645\u0633\u0648\u0646\u062C \u062C\u0627\u0644\u0627\u0643\u0633\u064A \u0628\u0627\u062F\u0632 \u0628\u0631\u0648',
    description: '<p>Active noise cancelling earbuds</p>',
    description_ar: '<p>\u0633\u0645\u0627\u0639\u0627\u062A \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0636\u0648\u0636\u0627\u0621</p>',
    brand: 'Samsung',
    category_id: 'electronics-audio',
    category_name: 'Audio',
    skus: [
      {
        sku: 'SKU-BUDS-BLK',
        seller_sku: 'SELLER-BUDS-BLK',
        barcode: '8806090574894',
        title: 'Galaxy Buds Pro - Black',
        title_ar: '\u062C\u0627\u0644\u0627\u0643\u0633\u064A \u0628\u0627\u062F\u0632 \u0628\u0631\u0648 - \u0623\u0633\u0648\u062F',
        price: 599,
        sale_price: 499,
        stock: 200,
        weight: 0.05,
        weight_unit: 'kg',
        status: 'live',
        images: ['https://img.noon.com/buds-blk.jpg'],
        options: { color: 'Black' },
      },
      {
        sku: 'SKU-BUDS-WHT',
        seller_sku: 'SELLER-BUDS-WHT',
        price: 599,
        stock: 150,
        status: 'live',
        options: { color: 'White' },
      },
    ],
    images: [
      'https://img.noon.com/product-main.jpg',
      'https://img.noon.com/product-alt.jpg',
    ],
    status: 'live',
    tags: ['electronics', 'audio', 'samsung'],
    created_at: '2024-03-01T10:00:00Z',
    updated_at: '2024-06-15T14:30:00Z',
    ...overrides,
  }
}

describe('transformProduct (Noon)', () => {
  it('uses product_id as the canonical id', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('NP-12345')
    expect(result.title).toBe('Samsung Galaxy Buds Pro')
  })

  it('maps product attributes to canonical fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBe('<p>Active noise cancelling earbuds</p>')
    expect(result.vendor).toBe('Samsung')
    expect(result.productType).toBe('Audio')
  })

  it('maps live status to ACTIVE', () => {
    expect(transformProduct(makeProduct()).status).toBe('ACTIVE')
  })

  it('maps pending status to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 'pending' }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps suspended status to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 'suspended' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps deleted status to ARCHIVED', () => {
    const result = transformProduct(makeProduct({ status: 'deleted' }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('extracts product images with positions', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      url: 'https://img.noon.com/product-main.jpg',
      position: 0,
    })
    expect(result.images![1]).toMatchObject({
      url: 'https://img.noon.com/product-alt.jpg',
      position: 1,
    })
  })

  it('maps SKUs to variants with parsed prices', () => {
    const result = transformProduct(makeProduct(), 'AED')
    expect(result.variants).toHaveLength(2)
    const v1 = result.variants![0]!
    expect(v1.id).toBe('SKU-BUDS-BLK')
    expect(v1.sku).toBe('SELLER-BUDS-BLK')
    expect(v1.barcode).toBe('8806090574894')
    expect(v1.price).toEqual({ amount: 599, currency: 'AED' })
    expect(v1.compareAtPrice).toEqual({ amount: 499, currency: 'AED' })
    expect(v1.weight).toBe(0.05)
    expect(v1.weightUnit).toBe('kg')
    expect(v1.optionValues).toEqual({ color: 'Black' })
  })

  it('handles missing sale_price gracefully', () => {
    const result = transformProduct(makeProduct(), 'AED')
    const v2 = result.variants![1]!
    expect(v2.compareAtPrice).toBeUndefined()
  })

  it('preserves tags', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['electronics', 'audio', 'samsung'])
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct(), 'AED')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata['product_id']).toBe('NP-12345')
    expect(result.metadata['status']).toBe('live')
    expect(result.metadata['title_ar']).toBe('\u0633\u0627\u0645\u0633\u0648\u0646\u062C \u062C\u0627\u0644\u0627\u0643\u0633\u064A \u0628\u0627\u062F\u0632 \u0628\u0631\u0648')
  })

  it('falls back to Arabic title when English title is missing', () => {
    const result = transformProduct(makeProduct({ title: undefined }))
    expect(result.title).toBe('\u0633\u0627\u0645\u0633\u0648\u0646\u062C \u062C\u0627\u0644\u0627\u0643\u0633\u064A \u0628\u0627\u062F\u0632 \u0628\u0631\u0648')
  })

  it('handles products with no SKUs', () => {
    const result = transformProduct(makeProduct({ skus: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('handles products with no images', () => {
    const result = transformProduct(makeProduct({ images: undefined }))
    expect(result.images).toBeUndefined()
  })
})

describe('mapProductStatus (Noon)', () => {
  it('returns undefined for unknown statuses', () => {
    expect(mapProductStatus('foo')).toBeUndefined()
    expect(mapProductStatus(undefined)).toBeUndefined()
  })
})

describe('untransformProduct (Noon)', () => {
  it('produces a Noon-shaped payload from canonical product', () => {
    const canonical = transformProduct(makeProduct(), 'AED')
    const body = untransformProduct(canonical)
    expect(body['title']).toBe('Samsung Galaxy Buds Pro')
    expect(body['brand']).toBe('Samsung')
  })

  it('maps variants to Noon sku array', () => {
    const canonical = transformProduct(makeProduct(), 'AED')
    const body = untransformProduct(canonical)
    const skus = body['skus'] as Array<Record<string, unknown>>
    expect(skus).toHaveLength(2)
    expect(skus[0]!['seller_sku']).toBe('SELLER-BUDS-BLK')
  })

  it('preserves Arabic fields in untransform', () => {
    const canonical = transformProduct(makeProduct(), 'AED')
    const body = untransformProduct(canonical)
    expect(body['title_ar']).toBe('\u0633\u0627\u0645\u0633\u0648\u0646\u062C \u062C\u0627\u0644\u0627\u0643\u0633\u064A \u0628\u0627\u062F\u0632 \u0628\u0631\u0648')
  })
})
