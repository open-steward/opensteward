import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawShopifyProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/jimdo/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

describe('transformProduct (jimdo)', () => {
  const raw: RawShopifyProduct = {
    id: 42,
    title: 'Wireless Keyboard',
    body_html: '<p>A compact wireless keyboard.</p>',
    handle: 'wireless-keyboard',
    status: 'active',
    vendor: 'Acme',
    product_type: 'Accessories',
    tags: 'electronics, keyboard',
    options: [{ id: 1, name: 'Color', position: 0, values: ['Black', 'White'] }],
    variants: [
      {
        id: 101,
        product_id: 42,
        title: 'Black',
        price: '49.99',
        compare_at_price: '59.99',
        sku: 'WK-BLK',
        barcode: '0123456789012',
        weight: 850,
        weight_unit: 'g',
        taxable: true,
        requires_shipping: true,
        option1: 'Black',
        position: 0,
      },
    ],
    images: [
      {
        id: 200,
        src: 'https://cdn.example.com/keyboard.jpg',
        alt: 'Wireless Keyboard Black',
        width: 1200,
        height: 800,
        position: 0,
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformProduct(raw)
    expect(result.id).toBe('42')
  })

  it('maps title and description', () => {
    const result = transformProduct(raw)
    expect(result.title).toBe('Wireless Keyboard')
    expect(result.description).toBe('<p>A compact wireless keyboard.</p>')
  })

  it('maps handle', () => {
    const result = transformProduct(raw)
    expect(result.handle).toBe('wireless-keyboard')
  })

  it('maps status active → ACTIVE', () => {
    const result = transformProduct(raw)
    expect(result.status).toBe('ACTIVE')
  })

  it('maps vendor and productType', () => {
    const result = transformProduct(raw)
    expect(result.vendor).toBe('Acme')
    expect(result.productType).toBe('Accessories')
  })

  it('splits tags from comma-separated string', () => {
    const result = transformProduct(raw)
    expect(result.tags).toEqual(['electronics', 'keyboard'])
  })

  it('maps variants with minor-unit prices', () => {
    const result = transformProduct(raw, 'USD')
    expect(result.variants).toHaveLength(1)
    // 49.99 USD → 4999 cents
    expect(result.variants![0]!.price).toEqual({ amount: 4999, currency: 'USD' })
    // compare_at: 59.99 → 5999
    expect(result.variants![0]!.compareAtPrice).toEqual({ amount: 5999, currency: 'USD' })
    expect(result.variants![0]!.sku).toBe('WK-BLK')
    expect(result.variants![0]!.weightUnit).toBe('g')
  })

  it('builds optionValues from option1 + options list', () => {
    const result = transformProduct(raw, 'USD')
    expect(result.variants![0]!.optionValues).toEqual({ Color: 'Black' })
  })

  it('maps images', () => {
    const result = transformProduct(raw)
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.example.com/keyboard.jpg')
    expect(result.images![0]!.alt).toBe('Wireless Keyboard Black')
  })

  it('produces schema-valid output', () => {
    const result = transformProduct(raw, 'USD')
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformProduct', () => {
    const result = transformProduct(raw, 'USD')
    const back = untransformProduct(result)
    expect(back.title).toBe(raw.title)
    expect(back.body_html).toBe(raw.body_html)
    expect(back.status).toBe('active')
  })
})
