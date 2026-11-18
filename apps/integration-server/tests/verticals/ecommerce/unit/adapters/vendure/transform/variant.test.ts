import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  untransformVariant,
  type RawVendureVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/vendure/transform/variant'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawVendureVariant> = {}): RawVendureVariant {
  return {
    id: '10',
    name: 'Large / Blue',
    sku: 'SHIRT-L-BLUE',
    price: 2999, // $29.99 in cents
    currencyCode: 'EUR',
    product: { id: '1' },
    options: [
      { id: 'O1', name: 'Large', code: 'large', group: { name: 'Size', code: 'size' } },
      { id: 'O2', name: 'Blue', code: 'blue', group: { name: 'Color', code: 'color' } },
    ],
    ...overrides,
  }
}

describe('transformVariant (Vendure)', () => {
  it('maps core fields', () => {
    const result = transformVariant(makeVariant())
    expect(result.id).toBe('10')
    expect(result.sku).toBe('SHIRT-L-BLUE')
    expect(result.title).toBe('Large / Blue')
    expect(result.productId).toBe('1')
  })

  it('converts price from cents to dollars', () => {
    const result = transformVariant(makeVariant())
    expect(result.price).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('falls back to supplied currency when currencyCode is missing', () => {
    const result = transformVariant(makeVariant({ currencyCode: undefined, price: 0 }), 'SEK')
    expect(result.price).toEqual({ amount: 0, currency: 'SEK' })
  })

  it('maps option values', () => {
    const result = transformVariant(makeVariant())
    expect(result.optionValues).toEqual({ Size: 'Large', Color: 'Blue' })
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeVariant()
    const result = transformVariant(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const result = transformVariant(makeVariant())
    expect(() => ProductVariantSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformVariant', () => {
    const canonical = transformVariant(makeVariant())
    const raw = untransformVariant(canonical)
    expect(raw['sku']).toBe('SHIRT-L-BLUE')
    expect(raw['name']).toBe('Large / Blue')
    // Price should be converted back to cents
    expect(raw['price']).toBe(2999)
  })
})
