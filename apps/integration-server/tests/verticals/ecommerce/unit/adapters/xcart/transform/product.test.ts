import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type XCartProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/xcart/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<XCartProduct> = {}): XCartProduct {
  return {
    id: 123,
    sku: 'PROD-001',
    name: 'Wireless Keyboard',
    description: '<p>A compact wireless keyboard.</p>',
    brief_description: 'Compact wireless keyboard',
    price: 49.99,
    sale_price: null,
    enabled: true,
    weight: 0.5,
    quantity: 100,
    images: [
      { id: 1, url: 'https://cdn.example.com/products/kb.jpg', alt: 'Keyboard front' },
      { id: 2, url: 'https://cdn.example.com/products/kb-back.jpg', alt: 'Keyboard back' },
    ],
    categories: [{ id: 5, name: 'Electronics' }],
    tags: ['wireless', 'keyboard', 'bluetooth'],
    vendor: 'TechBrand',
    ...overrides,
  }
}

describe('transformProduct (X-Cart)', () => {
  it('maps core fields and stringifies ids', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('123')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Wireless Keyboard')
    expect(result.description).toBe('<p>A compact wireless keyboard.</p>')
    expect(result.status).toBe('ACTIVE')
    expect(result.vendor).toBe('TechBrand')
  })

  it('maps disabled product to DRAFT status', () => {
    const result = transformProduct(makeProduct({ enabled: false }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps product type from first category', () => {
    const result = transformProduct(makeProduct())
    expect(result.productType).toBe('Electronics')
  })

  it('returns undefined productType when no categories', () => {
    const result = transformProduct(makeProduct({ categories: [] }))
    expect(result.productType).toBeUndefined()
  })

  it('maps tags array', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['wireless', 'keyboard', 'bluetooth'])
  })

  it('maps images with id, url, and alt', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(2)
    expect(result.images![0]).toMatchObject({
      id: '1',
      url: 'https://cdn.example.com/products/kb.jpg',
      alt: 'Keyboard front',
    })
  })

  it('synthesises a single default variant with correct price', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('123:default')
    expect(v.productId).toBe('123')
    expect(v.sku).toBe('PROD-001')
    expect(v.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(v.weight).toBe(0.5)
    expect(v.weightUnit).toBe('kg')
    expect(v.inventoryItemId).toBe('123')
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('maps compareAtPrice when sale_price is set', () => {
    // When sale_price is set, original price becomes compareAtPrice
    const result = transformProduct(makeProduct({ price: 49.99, sale_price: 39.99 }))
    const v = result.variants![0]!
    expect(v.compareAtPrice).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('omits compareAtPrice when sale_price is null', () => {
    const result = transformProduct(makeProduct({ sale_price: null }))
    const v = result.variants![0]!
    expect(v.compareAtPrice).toBeUndefined()
  })

  it('handles null sku gracefully', () => {
    const result = transformProduct(makeProduct({ sku: null }))
    const v = result.variants![0]!
    expect(v.sku).toBeUndefined()
  })

  it('handles null weight gracefully', () => {
    const result = transformProduct(makeProduct({ weight: null }))
    const v = result.variants![0]!
    expect(v.weight).toBeUndefined()
    expect(v.weightUnit).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('accepts custom currency', () => {
    const result = transformProduct(makeProduct(), 'EUR')
    expect(result.variants![0]!.price.currency).toBe('EUR')
  })
})

describe('untransformProduct (X-Cart)', () => {
  it('maps enabled status from ACTIVE', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body['name']).toBe('Wireless Keyboard')
    expect(body['description']).toBe('<p>A compact wireless keyboard.</p>')
    expect(body['enabled']).toBe(true)
    expect(body['vendor']).toBe('TechBrand')
  })

  it('maps disabled from DRAFT status', () => {
    const canonical = transformProduct(makeProduct({ enabled: false }))
    const body = untransformProduct(canonical)
    expect(body['enabled']).toBe(false)
  })

  it('flattens price from first variant', () => {
    const canonical = transformProduct(makeProduct())
    const body = untransformProduct(canonical)
    expect(body['price']).toBe(49.99)
    expect(body['sku']).toBe('PROD-001')
  })
})
