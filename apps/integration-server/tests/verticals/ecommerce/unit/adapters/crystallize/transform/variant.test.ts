import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  untransformVariant,
  type RawCrystallizeVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/crystallize/transform/variant'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawCrystallizeVariant> = {}): RawCrystallizeVariant {
  return {
    id: 'var-001',
    name: 'Large / Blue',
    sku: 'TEE-LG-BLUE',
    isDefault: true,
    priceVariants: [
      { identifier: 'default', name: 'Default', price: 39.99, currency: 'USD' },
      { identifier: 'wholesale', name: 'Wholesale', price: 29.99, currency: 'USD' },
    ],
    attributes: [
      { attribute: 'Size', value: 'Large' },
      { attribute: 'Color', value: 'Blue' },
    ],
    images: [
      { url: 'https://media.crystallize.com/tee-blue.jpg', altText: 'Blue Tee' },
    ],
    productId: 'prod-001',
    ...overrides,
  }
}

describe('transformVariant (Crystallize)', () => {
  it('maps core fields', () => {
    const result = transformVariant(makeVariant())
    expect(result.id).toBe('var-001')
    expect(result.title).toBe('Large / Blue')
    expect(result.sku).toBe('TEE-LG-BLUE')
    expect(result.productId).toBe('prod-001')
  })

  it('selects price by currency', () => {
    const result = transformVariant(makeVariant(), 'USD')
    expect(result.price).toEqual({ amount: 3999, currency: 'USD' })
  })

  it('falls back to default price variant', () => {
    const result = transformVariant(makeVariant(), 'GBP')
    expect(result.price).toEqual({ amount: 3999, currency: 'USD' })
  })

  it('maps attributes to optionValues', () => {
    const result = transformVariant(makeVariant())
    expect(result.optionValues).toEqual({ Size: 'Large', Color: 'Blue' })
  })

  it('handles empty priceVariants', () => {
    const result = transformVariant(makeVariant({ priceVariants: [] }))
    expect(result.price).toEqual({ amount: 0, currency: 'USD' })
  })

  it('handles null priceVariants', () => {
    const result = transformVariant(makeVariant({ priceVariants: null }))
    expect(result.price).toEqual({ amount: 0, currency: 'USD' })
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

  it('round-trips writable fields via untransformVariant', () => {
    const canonical = transformVariant(makeVariant())
    const raw = untransformVariant(canonical)
    expect(raw['sku']).toBe('TEE-LG-BLUE')
    expect(raw['name']).toBe('Large / Blue')
  })
})
