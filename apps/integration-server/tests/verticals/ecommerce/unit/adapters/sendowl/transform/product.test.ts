/**
 * SendOwl Product → canonical Product.
 *
 * Field shapes verified against
 * https://dashboard.sendowl.com/developers/api/products (2026-09-13):
 *  - list/get responses wrap the object under a `product` key
 *  - confirmed fields: id, product_type, name, category, subcategory, price,
 *    currency_code, override_currency_code, created_at, updated_at,
 *    product_image_url, sales_page_url, weight
 *
 * SendOwl products are single-SKU (no variants — bundles are a separate
 * resource, not a product variant). Per the existing Gumroad adapter's
 * precedent for the same "digital single-SKU product" shape
 * (`../gumroad/transform/product.ts`), price is NOT synthesized onto a fake
 * variant: canonical `Product.variants` stays undefined and the raw price is
 * still reachable via `metadata`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  untransformProduct,
  type RawSendOwlProduct,
} from '../../../../../../../src/verticals/ecommerce/adapters/sendowl/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeProduct(overrides: Partial<RawSendOwlProduct> = {}): RawSendOwlProduct {
  return {
    id: 42,
    name: 'Curing RSI: The Complete Guide',
    product_type: 'digital',
    category: 'Health',
    subcategory: 'Ergonomics',
    price: '17.00',
    currency_code: 'USD',
    product_image_url: 'https://cdn.sendowl.com/products/42/cover.jpg',
    sales_page_url: 'https://mystore.example.com/products/42',
    created_at: '2010-08-30T16:53:10Z',
    updated_at: '2011-05-28T14:08:20Z',
    ...overrides,
  }
}

describe('transformProduct (sendowl)', () => {
  it('stringifies the numeric id and maps core fields', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Curing RSI: The Complete Guide')
    expect(result.productType).toBe('digital')
  })

  it('maps the single product image when present', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    expect(result.images![0]!.url).toBe('https://cdn.sendowl.com/products/42/cover.jpg')
  })

  it('omits images when product_image_url is absent', () => {
    const result = transformProduct(makeProduct({ product_image_url: undefined }))
    expect(result.images).toBeUndefined()
  })

  it('does not synthesize variants — SendOwl products are single-SKU with no variant endpoint', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toBeUndefined()
  })

  it('maps createdAt/updatedAt', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe('2010-08-30T16:53:10Z')
    expect(result.updatedAt).toBe('2011-05-28T14:08:20Z')
  })

  it('preserves the raw payload in metadata, including price', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toEqual(raw)
    expect(result.metadata['price']).toBe('17.00')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('still satisfies ProductSchema with only the required fields present', () => {
    const result = transformProduct({ id: 7, name: 'Minimal Product' })
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct, including price from metadata', () => {
    const canonical = transformProduct(makeProduct())
    const raw = untransformProduct(canonical)
    expect(raw['name']).toBe('Curing RSI: The Complete Guide')
    expect(raw['product_type']).toBe('digital')
    expect(raw['price']).toBe('17.00')
    expect(raw['currency_code']).toBe('USD')
  })

  it('untransform requires nothing beyond title for a brand-new product', () => {
    const raw = untransformProduct({ title: 'New Thing' })
    expect(raw['name']).toBe('New Thing')
  })
})
