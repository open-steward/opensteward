import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawPrestaShopCartRule,
} from '../../../../../../../src/verticals/ecommerce/adapters/prestashop/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeCartRule(
  overrides: Partial<RawPrestaShopCartRule> = {},
): RawPrestaShopCartRule {
  return {
    id: 3001,
    code: 'SAVE10',
    name: '10% Off Everything',
    reduction_percent: '10.000000',
    reduction_amount: '0.000000',
    free_shipping: 0,
    active: 1,
    quantity: 100,
    quantity_per_user: 1,
    date_from: '2024-01-01T00:00:00.000Z',
    date_to: '2024-12-31T23:59:59.000Z',
    date_add: '2024-01-01T00:00:00.000Z',
    minimum_amount: '50.000000',
    ...overrides,
  }
}

describe('transformDiscount (PrestaShop)', () => {
  it('maps percent-type cart rules correctly', () => {
    const result = transformDiscount(makeCartRule())
    expect(result.id).toBe('3001')
    expect(typeof result.id).toBe('string')
    expect(result.code).toBe('SAVE10')
    expect(result.title).toBe('10% Off Everything')
    expect(result.type).toBe('PERCENTAGE')
    expect(result.value).toBe(10)
    expect(result.usageLimit).toBe(100)
    expect(result.appliesTo).toBe('ORDER')
    expect(result.endsAt).toBe('2024-12-31T23:59:59.000Z')
  })

  it('maps minimum purchase amount', () => {
    const result = transformDiscount(makeCartRule())
    expect(result.minimumPurchaseAmount).toEqual({ amount: 5000, currency: 'EUR' })
  })

  it('maps fixed amount cart rules', () => {
    const result = transformDiscount(
      makeCartRule({ reduction_percent: '0', reduction_amount: '15.000000' }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(15)
    expect(result.appliesTo).toBe('ORDER')
  })

  it('detects FREE_SHIPPING when free_shipping flag is 1', () => {
    const result = transformDiscount(
      makeCartRule({ free_shipping: 1, reduction_percent: '0' }),
    )
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('handles multi-language name field', () => {
    const result = transformDiscount(
      makeCartRule({ name: { '1': 'English Discount', '2': 'Rabais' } }),
    )
    expect(result.title).toBe('English Discount')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeCartRule()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makeCartRule())
    const body = untransformDiscount(canonical)
    expect(body['code']).toBe('SAVE10')
    expect(body['reduction_percent']).toBe('10')
    expect(body['reduction_amount']).toBe('0')
    expect(body['quantity']).toBe(100)
  })
})
