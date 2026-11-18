import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type RawWooCommerceProduct,
  type RawWooCommerceVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/hepsiburada/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariation(overrides: Partial<RawWooCommerceVariation> = {}): RawWooCommerceVariation {
  return {
    id: 1101,
    sku: 'LAPTOP-16GB',
    price: '12999.99',
    regular_price: '13999.99',
    sale_price: '12999.99',
    status: 'publish',
    manage_stock: true,
    stock_quantity: 5,
    stock_status: 'instock',
    tax_status: 'taxable',
    attributes: [{ name: 'RAM', option: '16GB' }],
    menu_order: 1,
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawWooCommerceProduct> = {}): RawWooCommerceProduct {
  return {
    id: 501,
    name: 'Gaming Laptop',
    slug: 'gaming-laptop',
    date_created: '2024-03-01T00:00:00Z',
    date_created_gmt: '2024-03-01T00:00:00Z',
    date_modified: '2024-03-01T00:00:00Z',
    date_modified_gmt: '2024-03-01T00:00:00Z',
    type: 'variable',
    status: 'publish',
    description: '<p>High performance gaming laptop</p>',
    sku: 'LAPTOP-BASE',
    price: '12999.99',
    regular_price: '13999.99',
    manage_stock: false,
    stock_quantity: null,
    stock_status: 'instock',
    categories: [{ id: 10, name: 'Elektronik', slug: 'elektronik' }],
    tags: [{ name: 'gaming' }, { name: 'laptop' }],
    images: [
      {
        id: 601,
        src: 'https://cdn.hepsiburada.com/laptop.jpg',
        name: 'Gaming Laptop',
        alt: 'Gaming Laptop',
        position: 0,
      },
    ],
    attributes: [
      {
        id: 1,
        name: 'RAM',
        position: 0,
        visible: true,
        variation: true,
        options: ['8GB', '16GB', '32GB'],
      },
    ],
    variations: [makeVariation()],
    ...overrides,
  }
}

describe('transformProduct (hepsiburada / WooCommerce)', () => {
  it('maps id, title, handle/slug, and description', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('501')
    expect(result.title).toBe('Gaming Laptop')
    expect(result.handle).toBe('gaming-laptop')
    expect(result.description).toBe('<p>High performance gaming laptop</p>')
  })

  it('maps publish status to ACTIVE', () => {
    expect(transformProduct(makeProduct({ status: 'publish' })).status).toBe('ACTIVE')
  })

  it('maps draft status', () => {
    expect(transformProduct(makeProduct({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps productType from first category', () => {
    const result = transformProduct(makeProduct())
    expect(result.productType).toBe('Elektronik')
  })

  it('maps tags from tag name array', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['gaming', 'laptop'])
  })

  it('maps attributes to options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]).toMatchObject({
      name: 'RAM',
      values: ['8GB', '16GB', '32GB'],
    })
  })

  it('maps images', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.hepsiburada.com/laptop.jpg')
  })

  it('maps variation objects to variants', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('501:1101')
    expect(v.sku).toBe('LAPTOP-16GB')
    expect(v.optionValues).toEqual({ RAM: '16GB' })
  })

  it('synthesizes a single default variant for simple products', () => {
    const result = transformProduct(makeProduct({ type: 'simple', variations: [] }))
    expect(result.variants).toHaveLength(1)
    expect(result.variants![0]!.id).toBe('501:default')
  })

  it('maps createdAt from date_created_gmt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeProduct()))).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct', () => {
    const body = untransformProduct(transformProduct(makeProduct()))
    expect(body['name']).toBe('Gaming Laptop')
    expect(body['status']).toBe('publish')
    expect(body['description']).toBe('<p>High performance gaming laptop</p>')
  })
})

describe('transformProductVariant (hepsiburada) standalone', () => {
  it('maps id as productId:variationId', () => {
    const v = transformProductVariant(makeVariation(), '501')
    expect(v.id).toBe('501:1101')
    expect(v.productId).toBe('501')
  })

  it('maps sku and price in minor units', () => {
    const v = transformProductVariant(makeVariation(), '501')
    expect(v.sku).toBe('LAPTOP-16GB')
    // 12999.99 USD → 1299999 cents
    expect(v.price).toMatchObject({ amount: 1299999, currency: 'USD' })
  })

  it('maps optionValues from attributes', () => {
    const v = transformProductVariant(makeVariation(), '501')
    expect(v.optionValues).toEqual({ RAM: '16GB' })
  })
})
