/**
 * Docs: https://developers.tray.com.br/ `#listagem-de-produtos-get`,
 * `#cadastrar-produto-post` (product), `#listagem-de-variacoes-get`,
 * `#consultar-dados-da-variacao-get` (variant) — fetched with curl; see
 * `transform/product.ts` header for exactly which fields come from a real
 * example vs. a documented field table.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProduct,
  transformVariant,
  untransformProduct,
  untransformVariant,
  type RawTrayProduct,
  type RawTrayVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/tray-commerce/transform/product'
import {
  ProductSchema,
  ProductVariantSchema,
} from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawTrayVariant> = {}): RawTrayVariant {
  return {
    id: '3',
    product_id: '18',
    ean: '123',
    price: '12.50',
    cost_price: '10.00',
    stock: '51',
    reference: 'THR016-1',
    weight: '21',
    promotional_price: '10.00',
    available: '1',
    ...overrides,
  }
}

function makeProduct(overrides: Partial<RawTrayProduct> = {}): RawTrayProduct {
  return {
    id: '3',
    name: 'PRODUTO TESTE',
    slug: 'produto-teste',
    brand: '',
    available_in_store: '1',
    created: '2016-10-19 09:30:12',
    modified: '2018-12-26 13:46:12',
    Variant: [makeVariant()],
    ...overrides,
  }
}

describe('transformVariant (Tray Commerce — /products/variants)', () => {
  it('maps id, productId, sku (from reference), barcode (from ean)', () => {
    const result = transformVariant(makeVariant())
    expect(result.id).toBe('3')
    expect(result.productId).toBe('18')
    expect(result.sku).toBe('THR016-1')
    expect(result.barcode).toBe('123')
  })

  it('converts price from major-unit BRL string to minor units', () => {
    const result = transformVariant(makeVariant())
    expect(result.price).toEqual({ amount: 1250, currency: 'BRL' })
  })

  it('maps promotional_price to compareAtPrice', () => {
    const result = transformVariant(makeVariant())
    expect(result.compareAtPrice).toEqual({ amount: 1000, currency: 'BRL' })
  })

  it('omits compareAtPrice when promotional_price is absent', () => {
    const result = transformVariant(makeVariant({ promotional_price: undefined }))
    expect(result.compareAtPrice).toBeUndefined()
  })

  it('maps weight', () => {
    expect(transformVariant(makeVariant()).weight).toBe(21)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariant()
    expect(transformVariant(raw).metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductVariantSchema', () => {
    expect(() => ProductVariantSchema.parse(transformVariant(makeVariant()))).not.toThrow()
  })

  it('round-trips product_id, ean and reference via untransformVariant', () => {
    const variant = transformVariant(makeVariant())
    const body = untransformVariant(variant)
    expect(body['product_id']).toBe('18')
    expect(body['ean']).toBe('123')
    expect(body['reference']).toBe('THR016-1')
    expect(body['price']).toBeCloseTo(12.5)
  })
})

describe('transformProduct (Tray Commerce)', () => {
  it('maps id, title (from name), handle (from slug)', () => {
    const result = transformProduct(makeProduct())
    expect(result.id).toBe('3')
    expect(result.title).toBe('PRODUTO TESTE')
    expect(result.handle).toBe('produto-teste')
  })

  it('does not read `description` — never shown in a documented response example', () => {
    const result = transformProduct(makeProduct())
    expect(result.description).toBeUndefined()
  })

  it('maps status from available_in_store (1 = ACTIVE, per the docs’ Regras prose, not Table C)', () => {
    expect(transformProduct(makeProduct({ available_in_store: '1' })).status).toBe('ACTIVE')
    expect(transformProduct(makeProduct({ available_in_store: '0' })).status).toBe('DRAFT')
    expect(transformProduct(makeProduct({ available_in_store: undefined })).status).toBeUndefined()
  })

  it('maps embedded Variant[] using the same, separately-verified Variant shape', () => {
    const result = transformProduct(makeProduct())
    expect(result.variants).toHaveLength(1)
    expect(result.variants?.[0]?.id).toBe('3')
  })

  it('omits variants when Variant[] is empty (the common case on a real product payload)', () => {
    const result = transformProduct(makeProduct({ Variant: [] }))
    expect(result.variants).toBeUndefined()
  })

  it('does not map images — ProductImage internal shape was never shown in any documented example', () => {
    const result = transformProduct(makeProduct())
    expect(result.images).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeProduct()
    expect(transformProduct(raw).metadata).toBe(raw)
  })

  it('produces a payload satisfying ProductSchema', () => {
    expect(() => ProductSchema.parse(transformProduct(makeProduct()))).not.toThrow()
  })

  it('round-trips title, description and status via untransformProduct (description is write-only)', () => {
    const product = transformProduct(makeProduct())
    const body = untransformProduct({ ...product, description: 'A great product.' })
    expect(body['name']).toBe('PRODUTO TESTE')
    expect(body['description']).toBe('A great product.')
    expect(body['available']).toBe(1)
    expect(body['available_in_store']).toBe(1)
  })
})
