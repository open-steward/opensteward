/**
 * ColorMe Shop Product/Variant transform — verified directly against the
 * OpenAPI spec at https://api.shop-pro.jp/v1/spec/open_api.json
 * (paths["/v1/products"], paths[".../variants"]): `name`, `expl`,
 * `display_state`, `options[].values` (a real string array, unlike
 * Haravan), `variants[].option_price`. Prices are integer JPY with no
 * currency field anywhere in the spec.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  splitVariantId,
  type RawColormeProduct,
  type RawColormeVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/colorme-shop/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawColormeVariant> = {}): RawColormeVariant {
  return {
    id: 632910392,
    product_id: 1342332,
    option1_value: '赤',
    title: '赤',
    stocks: 20,
    option_price: 1980,
    make_date: 1465784934,
    update_date: 1494496809,
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawColormeProduct> = {}): RawColormeProduct {
  return {
    id: 1342332,
    name: 'Tシャツ',
    expl: 'Cotton T-shirt',
    display_state: 'showing',
    sales_price: 1980,
    options: [{ id: 539903, product_id: 1342332, name: '色', values: ['赤', '白'] }],
    variants: [makeVariant()],
    images: [{ src: 'https://img.shop-pro.jp/tshirt.jpg', position: 1 }],
    make_date: 1465784934,
    update_date: 1494496809,
    ...overrides,
  }
}

describe('transformProduct (colorme-shop)', () => {
  it('maps id, title from name, and description from expl', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('1342332')
    expect(result.title).toBe('Tシャツ')
    expect(result.description).toBe('Cotton T-shirt')
  })

  it('maps display_state to ACTIVE/DRAFT', () => {
    expect(transformProduct(makeProduct({ display_state: 'showing' })).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ display_state: 'hidden' })).status).toBe('DRAFT')
  })

  it('maps options with their real values array', () => {
    const result = transformProduct(makeProduct())
    expect(result.options).toEqual([{ id: '539903', name: '色', values: ['赤', '白'] }])
  })

  it('maps a variant with a composite productId:variantId id and resolved optionValues', () => {
    const result = transformProduct(makeProduct())
    const v = result.variants![0]!
    expect(v.id).toBe('1342332:632910392')
    expect(v.optionValues).toEqual({ 色: '赤' })
    expect(v.price).toEqual({ amount: 1980, currency: 'JPY' })
  })

  it('never maps a product-level stocks/price onto a synthetic variant that was not returned', () => {
    const result = transformProduct(makeProduct({ variants: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('throws rather than reporting a 0 price when option_price is missing', () => {
    expect(() => transformVariant(makeVariant({ option_price: null }))).toThrow()
  })

  it('splitVariantId parses the composite id and rejects a bare one', () => {
    expect(splitVariantId('1342332:632910392')).toEqual({ productId: '1342332', variantId: '632910392' })
    expect(() => splitVariantId('632910392')).toThrow()
  })

  it('produces a payload that satisfies ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeProduct()))).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct', () => {
    const body = untransformProduct(transformProduct(makeProduct()))
    expect(body['name']).toBe('Tシャツ')
    expect(body['expl']).toBe('Cotton T-shirt')
  })
})
