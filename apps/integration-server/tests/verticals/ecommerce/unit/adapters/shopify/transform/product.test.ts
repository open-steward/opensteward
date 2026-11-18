import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawShopifyProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopify/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawShopifyProduct> = {}): RawShopifyProduct {
  return {
    id: 987654321,
    title: 'Ocean Blue T-Shirt',
    body_html: '<p>A comfy tee.</p>',
    handle: 'ocean-blue-t-shirt',
    status: 'active',
    vendor: 'Acme',
    product_type: 'Shirts',
    tags: 'cotton, summer, tee',
    options: [
      { id: 1, name: 'Size', position: 1, values: ['S', 'M', 'L'] },
      { id: 2, name: 'Color', position: 2, values: ['Blue'] },
    ],
    variants: [
      {
        id: 111,
        product_id: 987654321,
        title: 'S / Blue',
        sku: 'TEE-S-BLUE',
        barcode: '0000001',
        price: '19.99',
        compare_at_price: '24.99',
        position: 1,
        inventory_item_id: 501,
        weight: 180,
        weight_unit: 'g',
        taxable: true,
        requires_shipping: true,
        option1: 'S',
        option2: 'Blue',
      },
    ],
    images: [
      {
        id: 900,
        position: 1,
        src: 'https://cdn.shopify.com/img/001.jpg',
        alt: 'Front',
        width: 1200,
        height: 1200,
      },
    ],
    created_at: '2024-01-10T12:00:00Z',
    updated_at: '2024-02-01T09:00:00Z',
    published_at: '2024-01-11T00:00:00Z',
    ...overrides,
  }
}

describe('transformProduct', () => {
  it('maps core fields and stringifies ids', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('987654321')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Ocean Blue T-Shirt')
    expect(result.handle).toBe('ocean-blue-t-shirt')
    expect(result.description).toBe('<p>A comfy tee.</p>')
    expect(result.vendor).toBe('Acme')
    expect(result.productType).toBe('Shirts')
    expect(result.status).toBe('ACTIVE')
  })

  it('splits tags into an array', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['cotton', 'summer', 'tee'])
  })

  it('maps variants with option values and stringified ids', () => {
    const result = transformProduct(makeProduct())
    const variant = result.variants![0]!
    expect(variant.id).toBe('111')
    expect(variant.sku).toBe('TEE-S-BLUE')
    expect(variant.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(variant.compareAtPrice).toEqual({ amount: 2499, currency: 'USD' })
    expect(variant.optionValues).toEqual({ Size: 'S', Color: 'Blue' })
    expect(variant.weightUnit).toBe('g')
    expect(variant.inventoryItemId).toBe('501')
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.shopify.com/img/001.jpg')
    expect(result.images![0]!.alt).toBe('Front')
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

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw.title).toBe('Ocean Blue T-Shirt')
    expect(raw.body_html).toBe('<p>A comfy tee.</p>')
    expect(raw.handle).toBe('ocean-blue-t-shirt')
    expect(raw.vendor).toBe('Acme')
    expect(raw.product_type).toBe('Shirts')
    expect(raw.status).toBe('active')
    expect(raw.tags).toBe('cotton, summer, tee')
  })
})
