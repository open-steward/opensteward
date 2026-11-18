import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type RawWooCommerceProduct,
  type RawWooCommerceVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/woocommerce/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariation(
  overrides: Partial<RawWooCommerceVariation> = {},
): RawWooCommerceVariation {
  return {
    id: 501,
    sku: 'TEE-S-BLUE',
    price: '19.99',
    regular_price: '24.99',
    sale_price: '19.99',
    status: 'publish',
    weight: '180',
    manage_stock: true,
    stock_quantity: 17,
    stock_status: 'instock',
    tax_status: 'taxable',
    attributes: [
      { name: 'Size', option: 'S' },
      { name: 'Color', option: 'Blue' },
    ],
    menu_order: 1,
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawWooCommerceProduct> = {}): RawWooCommerceProduct {
  return {
    id: 987654321,
    name: 'Ocean Blue T-Shirt',
    slug: 'ocean-blue-t-shirt',
    type: 'variable',
    status: 'publish',
    description: '<p>A comfy tee.</p>',
    short_description: 'Comfy tee',
    tags: [
      { id: 1, name: 'cotton' },
      { id: 2, name: 'summer' },
    ],
    categories: [{ id: 42, name: 'Shirts' }],
    attributes: [
      { id: 1, name: 'Size', position: 0, options: ['S', 'M', 'L'], variation: true },
      { id: 2, name: 'Color', position: 1, options: ['Blue'], variation: true },
    ],
    variations: [makeVariation()],
    images: [
      {
        id: 900,
        src: 'https://cdn.example.com/img/001.jpg',
        alt: 'Front',
        position: 0,
      },
    ],
    date_created: '2024-01-10T12:00:00.000Z',
    date_created_gmt: '2024-01-10T12:00:00.000Z',
    date_modified: '2024-02-01T09:00:00.000Z',
    date_modified_gmt: '2024-02-01T09:00:00.000Z',
    ...overrides,
  }
}

describe('transformProduct (WooCommerce)', () => {
  it('maps core fields and stringifies ids', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('987654321')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Ocean Blue T-Shirt')
    expect(result.handle).toBe('ocean-blue-t-shirt')
    expect(result.description).toBe('<p>A comfy tee.</p>')
    expect(result.productType).toBe('Shirts')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps tags and options', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['cotton', 'summer'])
    expect(result.options).toHaveLength(2)
    expect(result.options![0]).toMatchObject({ name: 'Size', values: ['S', 'M', 'L'] })
  })

  it('maps nested variations with composite ids and option values', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('987654321:501')
    expect(v.productId).toBe('987654321')
    expect(v.sku).toBe('TEE-S-BLUE')
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 2499, currency: 'USD' })
    expect(v.optionValues).toEqual({ Size: 'S', Color: 'Blue' })
    expect((v.metadata as { parentProductId?: string }).parentProductId).toBe('987654321')
  })

  it('synthesises a default variant for simple products', () => {
    const simple = makeProduct({
      type: 'simple',
      sku: 'SIMPLE-1',
      price: '9.99',
      regular_price: '9.99',
      variations: [],
    })
    const result = transformProduct(simple)
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('987654321:default')
    expect(v.sku).toBe('SIMPLE-1')
    expect(v.price).toEqual({ amount: 999, currency: 'USD' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
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
    const canonical = transformProduct(makeProduct({ type: 'simple', variations: [] }))
    const body = untransformProduct(canonical)
    expect(body['name']).toBe('Ocean Blue T-Shirt')
    expect(body['description']).toBe('<p>A comfy tee.</p>')
    expect(body['slug']).toBe('ocean-blue-t-shirt')
    expect(body['status']).toBe('publish')
  })
})

describe('transformProductVariant (WooCommerce) standalone', () => {
  it('builds a canonical variant from a raw variation', () => {
    const v = transformProductVariant(makeVariation(), '987654321')
    expect(v.id).toBe('987654321:501')
    expect(v.inventoryItemId).toBe('501')
    expect(v.weight).toBe(180)
    expect(v.weightUnit).toBe('g')
  })
})
