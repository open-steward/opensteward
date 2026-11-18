import { describe, it, expect } from 'vitest'
import {
  transformOffer,
  untransformOffer,
  type RawMiraklOffer,
} from '../../../../../../../src/verticals/ecommerce/adapters/mirakl/transform/product'
import { ProductSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeRaw(overrides: Partial<RawMiraklOffer> = {}): RawMiraklOffer {
  return {
    offer_id: 'OFFER-99',
    shop_sku: 'SKU-A',
    product_sku: 'CATALOG-SKU-1',
    product_title: 'Widget Pro',
    description: 'A great widget',
    price: 29.99,
    currency_iso_code: 'EUR',
    origin_price: 39.99,
    active: true,
    category_code: 'ELECTRONICS',
    quantity: 10,
    update_date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOffer (Mirakl)', () => {
  it('maps offer_id to product id and variant id', () => {
    const result = transformOffer(makeRaw())
    expect(result.id).toBe('OFFER-99')
    expect(result.variants![0]!.id).toBe('OFFER-99')
  })

  it('maps product_title to title', () => {
    const result = transformOffer(makeRaw())
    expect(result.title).toBe('Widget Pro')
  })

  it('converts price major units to minor units', () => {
    const result = transformOffer(makeRaw())
    // EUR 2 decimal digits → 29.99 × 100 = 2999
    expect(result.variants![0]!.price).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('maps origin_price to compareAtPrice when different from price', () => {
    const result = transformOffer(makeRaw())
    expect(result.variants![0]!.compareAtPrice).toEqual({ amount: 3999, currency: 'EUR' })
  })

  it('omits compareAtPrice when origin_price equals price', () => {
    const result = transformOffer(makeRaw({ origin_price: 29.99 }))
    expect(result.variants![0]!.compareAtPrice).toBeUndefined()
  })

  it('maps active=true to ACTIVE status', () => {
    const result = transformOffer(makeRaw())
    expect(result.status).toBe('ACTIVE')
  })

  it('maps active=false to ARCHIVED status', () => {
    const result = transformOffer(makeRaw({ active: false }))
    expect(result.status).toBe('ARCHIVED')
  })

  it('maps shop_sku to variant.sku', () => {
    const result = transformOffer(makeRaw())
    expect(result.variants![0]!.sku).toBe('SKU-A')
  })

  it('maps category_code to productType', () => {
    const result = transformOffer(makeRaw())
    expect(result.productType).toBe('ELECTRONICS')
  })

  it('maps update_date to updatedAt', () => {
    const result = transformOffer(makeRaw())
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces a payload that satisfies ProductSchema', () => {
    const result = transformOffer(makeRaw())
    expect(() => ProductSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOffer (Mirakl)', () => {
  it('round-trips shop_sku from variant.sku', () => {
    const raw = makeRaw()
    const product = transformOffer(raw)
    const body = untransformOffer(product)
    expect(body['shop_sku']).toBe('SKU-A')
  })

  it('sets active=true for ACTIVE status', () => {
    const product = transformOffer(makeRaw())
    const body = untransformOffer(product)
    expect(body['active']).toBe(true)
  })

  it('sets active=false for ARCHIVED status', () => {
    const product = transformOffer(makeRaw({ active: false }))
    const body = untransformOffer(product)
    expect(body['active']).toBe(false)
  })
})
