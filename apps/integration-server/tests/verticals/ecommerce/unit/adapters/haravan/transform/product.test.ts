/**
 * Haravan Product/Variant transform — field names verified against
 * https://docs.haravan.com/docs/omni-apis/products/ and
 * https://docs.haravan.com/docs/omni-apis/product-variants/ (raw doc HTML,
 * not summarised): `body_html`, `variants[].option1/2/3`,
 * `variants[].inventory_quantity`, `options[]` with no `values` array.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  type RawHaravanProduct,
  type RawHaravanVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/haravan/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawHaravanVariant> = {}): RawHaravanVariant {
  return {
    id: 1061514767,
    product_id: 1028183686,
    title: 'Đen / S',
    price: 600000,
    sku: 'AO551',
    barcode: 'AO551',
    position: 1,
    grams: 10,
    taxable: true,
    requires_shipping: true,
    option1: 'Đen',
    option2: 'S',
    inventory_quantity: 23,
    created_at: '2020-09-18T04:12:09.577Z',
    updated_at: '2021-11-26T06:23:12.986Z',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawHaravanProduct> = {}): RawHaravanProduct {
  return {
    id: 1028183686,
    title: 'iPod Nano - 8GB',
    body_html: '<p>Traditional dress</p>',
    handle: 'iPod-nano',
    vendor: 'Apple',
    product_type: 'Cult Products',
    tags: 'Emotive, Flash Memory',
    options: [{ id: 2420902356, name: 'Color', position: 1, product_id: 1028183686 }],
    variants: [makeVariant()],
    images: [{ id: 1164472706, product_id: 1028183686, position: 1, src: 'https://example.com/burton.jpg' }],
    created_at: '2020-09-18T04:12:09.577Z',
    updated_at: '2021-11-26T06:23:12.986Z',
    published_at: '2020-09-18T04:12:09.577Z',
    ...overrides,
  }
}

describe('transformProduct (haravan)', () => {
  it('maps id, title, handle, and description from body_html', () => {
    const result = transformProduct(makeProduct(), 'VND')
    expect(result.id).toBe('1028183686')
    expect(result.title).toBe('iPod Nano - 8GB')
    expect(result.handle).toBe('ipod-nano')
    expect(result.description).toBe('<p>Traditional dress</p>')
  })

  it('derives ACTIVE status from published_at', () => {
    expect(transformProduct(makeProduct({ published_at: '2020-01-01T00:00:00Z' }), 'VND').status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ published_at: null }), 'VND').status).toBe('DRAFT')
  })

  it('maps vendor, productType, and splits tags', () => {
    const result = transformProduct(makeProduct(), 'VND')
    expect(result.vendor).toBe('Apple')
    expect(result.productType).toBe('Cult Products')
    expect(result.tags).toEqual(['Emotive', 'Flash Memory'])
  })

  it('derives option values from the variants actually present (no values array on the option)', () => {
    const result = transformProduct(makeProduct(), 'VND')
    expect(result.options).toHaveLength(1)
    expect(result.options![0]!.values).toEqual(['Đen'])
  })

  it('maps a variant with optionValues resolved by position', () => {
    const result = transformProduct(makeProduct(), 'VND')
    const v = result.variants![0]!
    expect(v.id).toBe('1061514767')
    expect(v.optionValues).toEqual({ Color: 'Đen' })
  })

  it('uses the shop currency passed in — never a hard-coded default', () => {
    const v = transformVariant(makeVariant(), 'VND')
    expect(v.price.currency).toBe('VND')
    expect(v.price.amount).toBe(600000)
  })

  it('throws rather than reporting a 0 price when price is missing', () => {
    expect(() => transformVariant(makeVariant({ price: undefined }), 'VND')).toThrow()
  })

  it('sets inventoryItemId to the variant id (used as product_variant_id on adjustorset)', () => {
    const v = transformVariant(makeVariant(), 'VND')
    expect(v.inventoryItemId).toBe('1061514767')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeProduct(), 'VND'))).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct', () => {
    const body = untransformProduct(transformProduct(makeProduct(), 'VND'))
    expect(body['title']).toBe('iPod Nano - 8GB')
    expect(body['vendor']).toBe('Apple')
  })
})

describe('transformProduct (haravan): images without src', () => {
  it('skips an image with no src instead of storing an empty URL', () => {
    const base = makeProduct()
    expect(base.images?.length).toBeGreaterThan(0)
    const result = transformProduct({ ...base, images: [{ ...base.images![0]!, src: undefined }] } as typeof base, 'VND')
    expect(result.images).toBeUndefined()
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})
