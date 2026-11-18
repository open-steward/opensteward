import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformProductVariant,
  untransformProduct,
  untransformProductVariant,
  type RawWooCommerceProduct,
  type RawWooCommerceVariation,
} from '../../../../../../../src/verticals/ecommerce/adapters/wbuy/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariation(
  overrides: Partial<RawWooCommerceVariation> = {},
): RawWooCommerceVariation {
  return {
    id: 100,
    sku: 'WIDGET-BLU',
    price: '19.99',
    regular_price: '24.99',
    sale_price: '19.99',
    status: 'publish',
    manage_stock: true,
    stock_quantity: 10,
    stock_status: 'instock',
    tax_status: 'taxable',
    attributes: [{ name: 'Color', option: 'Blue' }],
    menu_order: 0,
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawWooCommerceProduct> = {}): RawWooCommerceProduct {
  return {
    id: 55,
    name: 'Blue Widget',
    slug: 'blue-widget',
    type: 'variable',
    status: 'publish',
    price: '19.99',
    date_created_gmt: '2024-05-01T10:00:00.000Z',
    attributes: [
      { id: 1, name: 'Color', position: 0, options: ['Blue', 'Red'], variation: true },
    ],
    variations: [makeVariation()],
    ...overrides,
  }
}

describe('transformProduct (wbuy)', () => {
  it('maps core fields and stringifies id', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('55')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Blue Widget')
    expect(result.handle).toBe('blue-widget')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps nested variations with composite ids and option values', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('55:100')
    expect(v.productId).toBe('55')
    expect(v.sku).toBe('WIDGET-BLU')
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 2499, currency: 'USD' })
    expect(v.optionValues).toEqual({ Color: 'Blue' })
  })

  it('synthesises a default variant for simple products', () => {
    const simple = makeProduct({
      type: 'simple',
      sku: 'WIDGET-SIMPLE',
      price: '19.99',
      regular_price: '19.99',
      variations: [],
    })
    const result = transformProduct(simple)
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('55:default')
    expect(v.sku).toBe('WIDGET-SIMPLE')
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
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
    expect(body['name']).toBe('Blue Widget')
    expect(body['slug']).toBe('blue-widget')
    expect(body['status']).toBe('publish')
  })
})

describe('transformProductVariant (wbuy) standalone', () => {
  it('builds a canonical variant from a raw variation', () => {
    const v = transformProductVariant(makeVariation(), '55')
    expect(v.id).toBe('55:100')
    expect(v.productId).toBe('55')
    expect(v.inventoryItemId).toBe('100')
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('round-trips via untransformProductVariant', () => {
    const canonical = transformProductVariant(makeVariation(), '55')
    const body = untransformProductVariant(canonical)
    expect(body['sku']).toBe('WIDGET-BLU')
    expect(body['regular_price']).toBe('19.99')
  })
})
