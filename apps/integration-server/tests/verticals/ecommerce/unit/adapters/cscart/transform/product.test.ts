import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformCombination,
  untransformProduct,
  type CsCartProduct,
  type CsCartCombination,
} from '../../../../../../../src/verticals/ecommerce/adapters/cscart/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeCombination(overrides: Partial<CsCartCombination> = {}): CsCartCombination {
  return {
    combination_id: 10,
    product_id: 42,
    price: '19.99',
    list_price: '24.99',
    amount: 15,
    product_code: 'SHIRT-S-RED',
    status: 'A',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<CsCartProduct> = {}): CsCartProduct {
  return {
    product_id: 42,
    product: 'Classic Red Shirt',
    full_description: '<p>A great shirt.</p>',
    short_description: 'Great shirt',
    price: '29.99',
    list_price: '39.99',
    status: 'A',
    main_category: 5,
    amount: 100,
    product_code: 'SHIRT-RED',
    timestamp: 1704067200,
    updated_timestamp: 1704153600,
    main_pair: {
      detailed: {
        image_path: 'https://cdn.example.com/img/shirt.jpg',
        image_x: 800,
        image_y: 600,
        alt: 'Red Shirt',
      },
    },
    combinations: [makeCombination()],
    ...overrides,
  }
}

describe('transformProduct (CS-Cart)', () => {
  it('maps core fields and stringifies product_id', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.id).toBe('42')
    expect(typeof result.id).toBe('string')
    expect(result.title).toBe('Classic Red Shirt')
    expect(result.description).toBe('<p>A great shirt.</p>')
    expect(result.status).toBe('ACTIVE')
  })

  it('maps status A → ACTIVE, D → DRAFT, H → ARCHIVED', () => {
    expect(transformProduct(makeProduct({ status: 'A' })).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ status: 'D' })).status).toBe('DRAFT')
    expect(transformProduct(makeProduct({ status: 'H' })).status).toBe('ARCHIVED')
  })

  it('maps unknown/missing status to undefined', () => {
    expect(transformProduct(makeProduct({ status: undefined })).status).toBeUndefined()
    expect(transformProduct(makeProduct({ status: 'X' })).status).toBeUndefined()
  })

  it('maps main_pair image with dimensions and alt', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toHaveLength(1)
    const img = result.images![0]!
    expect(img.url).toBe('https://cdn.example.com/img/shirt.jpg')
    expect(img.alt).toBe('Red Shirt')
    expect(img.width).toBe(800)
    expect(img.height).toBe(600)
    expect(img.position).toBe(0)
  })

  it('maps combination to a canonical variant', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('42:10')
    expect(v.productId).toBe('42')
    expect(v.sku).toBe('SHIRT-S-RED')
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('synthesises a default variant when no combinations present', () => {
    const simple = makeProduct({ combinations: [] })
    const result = transformProduct(simple)
    expect(result.variants).toHaveLength(1)
    const v = result.variants![0]!
    expect(v.id).toBe('42:default')
    expect(v.sku).toBe('SHIRT-RED')
    expect(v.price).toEqual({ amount: 2999, currency: 'USD' })
    expect((v.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('does not set compareAtPrice when list_price <= price', () => {
    // Use a simple product (no combinations) so we test the product-level price check.
    const result = transformProduct(
      makeProduct({ list_price: '29.99', price: '29.99', combinations: [] }),
    )
    const v = result.variants![0]!
    expect(v.compareAtPrice).toBeUndefined()
  })

  it('converts Unix timestamps to ISO strings', () => {
    const result = transformProduct(makeProduct())
    expect(result.createdAt).toBe(new Date(1704067200 * 1000).toISOString())
    expect(result.updatedAt).toBe(new Date(1704153600 * 1000).toISOString())
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    const result = transformProduct(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces output that satisfies ProductSchema', () => {
    const result = transformProduct(makeProduct())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformProduct', () => {
    const canonical = transformProduct(makeProduct({ combinations: [] }))
    const body = untransformProduct(canonical)
    expect(body['product']).toBe('Classic Red Shirt')
    expect(body['full_description']).toBe('<p>A great shirt.</p>')
    expect(body['status']).toBe('A')
    expect(body['price']).toBe('2999')
    expect(body['product_code']).toBe('SHIRT-RED')
  })

  it('untransformProduct maps DRAFT and ARCHIVED status codes', () => {
    expect(untransformProduct({ status: 'DRAFT' })['status']).toBe('D')
    expect(untransformProduct({ status: 'ARCHIVED' })['status']).toBe('H')
  })

  it('handles product with no main_pair gracefully', () => {
    const result = transformProduct(makeProduct({ main_pair: null }))
    expect(result.images).toBeUndefined()
  })
})

describe('transformCombination (CS-Cart) standalone', () => {
  it('builds a canonical variant from a raw combination', () => {
    const v = transformCombination(makeCombination(), '42')
    expect(v.id).toBe('42:10')
    expect(v.productId).toBe('42')
    expect(v.sku).toBe('SHIRT-S-RED')
    expect(v.price).toEqual({ amount: 1999, currency: 'USD' })
    expect(v.compareAtPrice).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCombination()
    const result = transformCombination(raw, '42')
    expect(result.metadata).toBe(raw)
  })
})
