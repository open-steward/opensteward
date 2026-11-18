import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  untransformVariant,
  type RawSaleorVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/saleor/transform/variant'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawSaleorVariant> = {}): RawSaleorVariant {
  return {
    id: 'UHJvZHVjdFZhcmlhbnQ6MQ==',
    name: 'Small / Blue',
    sku: 'TEE-S-BLUE',
    pricing: { price: { gross: { amount: 29.99, currency: 'EUR' } } },
    weight: { value: 200, unit: 'g' },
    product: { id: 'PROD1' },
    ...overrides,
  }
}

describe('transformVariant (Saleor)', () => {
  it('maps core fields', () => {
    const result = transformVariant(makeVariant())
    expect(result.id).toBe('UHJvZHVjdFZhcmlhbnQ6MQ==')
    expect(result.sku).toBe('TEE-S-BLUE')
    expect(result.title).toBe('Small / Blue')
    expect(result.productId).toBe('PROD1')
    expect(result.weight).toBe(200)
    expect(result.weightUnit).toBe('g')
  })

  it('uses pricing from the GraphQL response', () => {
    const result = transformVariant(makeVariant())
    expect(result.price).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('falls back to supplied currency when pricing is missing', () => {
    const result = transformVariant(makeVariant({ pricing: null }), 'SEK')
    expect(result.price).toEqual({ amount: 0, currency: 'SEK' })
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
    expect(raw['sku']).toBe('TEE-S-BLUE')
    expect(raw['name']).toBe('Small / Blue')
  })
})
