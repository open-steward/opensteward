import { describe, it, expect } from 'vitest'
import {
  transformVariant,
  untransformVariant,
  moneyFromCt,
  pickLocalized,
  attributeValueToString,
  type RawCtVariant,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/variant'
import { ProductVariantSchema } from '../../../../../../../src/verticals/ecommerce/schema/product'

function makeVariant(overrides: Partial<RawCtVariant> = {}): RawCtVariant {
  return {
    id: 5,
    sku: 'MUG-RED',
    prices: [
      {
        value: { type: 'centPrecision', centAmount: 1299, currencyCode: 'USD', fractionDigits: 2 },
      },
    ],
    attributes: [
      { name: 'color', value: 'red' },
      { name: 'material', value: { 'en-US': 'Ceramic' } },
    ],
    ...overrides,
  }
}

describe('transformVariant (commercetools)', () => {
  it('maps price via moneyFromCt with fractional digits', () => {
    const r = transformVariant(makeVariant(), 'prod-1', 2)
    expect(r.price).toEqual({ amount: 1299, currency: 'USD' })
  })

  it('handles zero-fraction currencies like JPY correctly', () => {
    const money = moneyFromCt({ centAmount: 1999, currencyCode: 'JPY', fractionDigits: 0 })
    expect(money).toEqual({ amount: 1999, currency: 'JPY' })
  })

  it('builds composite id and preserves productId', () => {
    const r = transformVariant(makeVariant(), 'prod-1', 1)
    expect(r.id).toBe('prod-1:5')
    expect(r.productId).toBe('prod-1')
    expect(r.position).toBe(1)
  })

  it('flattens attribute LocalizedString values via pickLocalized', () => {
    const r = transformVariant(makeVariant(), 'prod-1')
    expect(r.optionValues).toEqual({ color: 'red', material: 'Ceramic' })
  })

  it('pickLocalized falls back to the first key if en-US is absent', () => {
    expect(pickLocalized({ 'de-DE': 'Rot', 'fr-FR': 'Rouge' })).toBe('Rot')
  })

  it('attributeValueToString handles enum values', () => {
    expect(attributeValueToString({ key: 'small', label: 'Small' })).toBe('Small')
    expect(attributeValueToString({ key: 'small', label: { 'en-US': 'Small' } })).toBe('Small')
  })

  it('produces a payload that satisfies ProductVariantSchema', () => {
    const r = transformVariant(makeVariant(), 'prod-1')
    expect(() => ProductVariantSchema.parse(r)).not.toThrow()
  })

  it('round-trips writable fields via untransformVariant', () => {
    const r = transformVariant(makeVariant(), 'prod-1')
    const raw = untransformVariant(r)
    expect(raw['sku']).toBe('MUG-RED')
    const prices = raw['prices'] as Array<{ value: { centAmount: number } }>
    expect(prices[0]!.value.centAmount).toBe(1299)
  })
})
