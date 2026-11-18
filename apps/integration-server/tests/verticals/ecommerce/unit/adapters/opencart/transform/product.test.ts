import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  type RawOpenCartProduct,
  type RawOpenCartProductOptionValue,
} from '../../../../../../../src/verticals/ecommerce/adapters/opencart/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawOpenCartProduct> = {}): RawOpenCartProduct {
  return {
    product_id: 42,
    name: 'Wireless Mouse',
    model: 'WM-100',
    sku: 'WM-100',
    slug: 'wireless-mouse',
    description: '<p>A sleek wireless mouse.</p>',
    tag: 'electronics, accessories',
    price: '29.99',
    special: null,
    quantity: 150,
    status: 1,
    image: 'catalog/product/mouse.jpg',
    images: [
      { product_image_id: 10, image: 'catalog/product/mouse-side.jpg', sort_order: '1' },
    ],
    categories: [{ category_id: 5, name: 'Electronics' }],
    options: [
      {
        product_option_id: 100,
        option_id: 1,
        name: 'Color',
        type: 'select',
        option_value: [
          { product_option_value_id: 200, option_value_id: 10, name: 'Black', quantity: '80', price: '0', price_prefix: '+' },
          { product_option_value_id: 201, option_value_id: 11, name: 'White', quantity: '70', price: '5.00', price_prefix: '+' },
        ],
      },
    ],
    weight: '120',
    date_added: '2024-01-10T12:00:00.000Z',
    date_modified: '2024-02-01T09:00:00.000Z',
    ...overrides,
  }
}

describe('transformProduct (OpenCart)', () => {
  it('maps core fields and stringifies ids', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Wireless Mouse')
    expect(result.handle).toBe('wireless-mouse')
    expect(result.description).toBe('<p>A sleek wireless mouse.</p>')
    expect(result.productType).toBe('Electronics')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps tags from comma-separated string', () => {
    const result = transformProduct(makeProduct())
    expect(result.tags).toEqual(['electronics', 'accessories'])
  })

  it('maps options from OpenCart product options', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toHaveLength(1)
    expect(result.options![0]).toMatchObject({
      name: 'Color',
      values: ['Black', 'White'],
    })
  })

  it('builds variants from option values with price adjustments', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(2)
    const v0 = result.variants![0]!
    expect(v0.id).toBe('42:200')
    expect(v0.productId).toBe('42')
    expect(v0.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(v0.optionValues).toEqual({ Color: 'Black' })

    const v1 = result.variants![1]!
    expect(v1.id).toBe('42:201')
    expect(v1.price!.amount).toBe(3499)
    expect(v1.price!.currency).toBe('USD')
    expect(v1.optionValues).toEqual({ Color: 'White' })
  })

  it('synthesises a default variant for products without options', () => {
    const simple = makeProduct({ options: [], model: 'WM-100' })
    const result = transformProduct(simple)
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('42:default')
    expect(v.sku).toBe('WM-100')
    expect(v.price).toEqual({ amount: 2999, currency: 'USD' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('maps status 0 to DRAFT', () => {
    const result = transformProduct(makeProduct({ status: 0 }))
    expect(result.status).toBe('DRAFT')
  })

  it('maps status string "1" to ACTIVE', () => {
    const result = transformProduct(makeProduct({ status: '1' }))
    expect(result.status).toBe('ACTIVE')
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
    const canonical = transformProduct(makeProduct({ options: [] }))
    const body = untransformProduct(canonical)
    expect(body['name']).toBe('Wireless Mouse')
    expect(body['description']).toBe('<p>A sleek wireless mouse.</p>')
    expect(body['slug']).toBe('wireless-mouse')
    expect(body['status']).toBe(1)
  })

  it('untransform maps DRAFT status to 0', () => {
    const body = untransformProduct({ title: 'Test', status: 'DRAFT' })
    expect(body['status']).toBe(0)
  })
})

describe('transformProductVariant (OpenCart) standalone', () => {
  it('builds a canonical variant from a raw option value', () => {
    const optionValue: RawOpenCartProductOptionValue = {
      product_option_value_id: 200,
      option_value_id: 10,
      name: 'Black',
      quantity: '80',
      price: '0',
      price_prefix: '+',
    }
    const v = transformProductVariant(optionValue, '42', 'Color', 29.99)
    expect(v.id).toBe('42:200')
    expect(v.productId).toBe('42')
    expect(v.title).toBe('Black')
    expect(v.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(v.optionValues).toEqual({ Color: 'Black' })
  })

  it('applies price prefix subtraction correctly', () => {
    const optionValue: RawOpenCartProductOptionValue = {
      product_option_value_id: 300,
      option_value_id: 20,
      name: 'Economy',
      price: '5.00',
      price_prefix: '-',
    }
    const v = transformProductVariant(optionValue, '42', 'Tier', 30)
    expect(v.price).toEqual({ amount: 2500, currency: 'USD' })
  })
})
