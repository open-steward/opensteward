import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  transformDiscountCode,
  type RawBrinkDiscountCodeResponse,
  untransformDiscountCode,
  untransformDiscountRule,
  type RawBrinkDiscountCode,
  type RawBrinkDiscountRule,
} from '../../../../../../../src/verticals/ecommerce/adapters/brink-commerce/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

describe('transformDiscount (brink-commerce)', () => {
  const code: RawBrinkDiscountCode = {
    id: 'code-abc',
    code: 'BRINK10',
    discountRuleId: 'rule-xyz',
    usageLimit: 50,
    usageCount: 3,
    isActive: true,
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T00:00:00Z',
  }

  const rule: RawBrinkDiscountRule = {
    id: 'rule-xyz',
    name: 'Brink 10% Off',
    discountType: 'PERCENTAGE',
    discountValue: 10,
    isActive: true,
    startsAt: '2024-03-01T00:00:00Z',
    endsAt: '2024-06-01T00:00:00Z',
    created: '2024-03-01T00:00:00Z',
  }

  it('maps id from code.id', () => {
    expect(transformDiscount(code, rule).id).toBe('code-abc')
  })

  it('maps code string', () => {
    expect(transformDiscount(code, rule).code).toBe('BRINK10')
  })

  it('maps title from rule.name', () => {
    expect(transformDiscount(code, rule).title).toBe('Brink 10% Off')
  })

  it('maps type to PERCENTAGE', () => {
    expect(transformDiscount(code, rule).type).toBe('PERCENTAGE')
  })

  it('maps percentage value as-is (0-100)', () => {
    // For PERCENTAGE type, value is passed through directly
    expect(transformDiscount(code, rule).value).toBe(10)
  })

  it('maps FIXED_AMOUNT type — value already in minor units from Brink', () => {
    const fixedRule: RawBrinkDiscountRule = {
      ...rule,
      discountType: 'FIXED_AMOUNT',
      discountValue: 500,
      currencyCode: 'EUR',
    }
    const result = transformDiscount(code, fixedRule)
    expect(result.type).toBe('FIXED_AMOUNT')
    expect(result.value).toBe(500)
    expect(result.currency).toBe('EUR')
  })

  it('maps usageLimit and usageCount', () => {
    const result = transformDiscount(code, rule)
    expect(result.usageLimit).toBe(50)
    expect(result.usageCount).toBe(3)
  })

  it('maps startsAt and endsAt from rule', () => {
    // toIsoDatetime normalizes to include milliseconds
    const result = transformDiscount(code, rule)
    expect(result.startsAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('passes DiscountSchema validation', () => {
    expect(() => DiscountSchema.parse(transformDiscount(code, rule))).not.toThrow()
  })

  it('handles missing rule gracefully', () => {
    const result = transformDiscount(code)
    expect(result.id).toBe('code-abc')
    expect(result.type).toBeUndefined()
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('maps FREE_SHIPPING type', () => {
    const freeRule: RawBrinkDiscountRule = { ...rule, discountType: 'FREE_SHIPPING' }
    expect(transformDiscount(code, freeRule).type).toBe('FREE_SHIPPING')
  })
})

describe('untransformDiscountCode (brink-commerce)', () => {
  it('returns code and usageLimit', () => {
    const result = untransformDiscountCode({ code: 'TEST', usageLimit: 10 })
    expect(result.code).toBe('TEST')
    expect(result.usageLimit).toBe(10)
  })
})

describe('untransformDiscountRule (brink-commerce)', () => {
  it('round-trips title and type', () => {
    const result = untransformDiscountRule({ title: 'My Rule', type: 'PERCENTAGE', value: 15 })
    expect(result.name).toBe('My Rule')
    expect(result.discountType).toBe('PERCENTAGE')
    expect(result.discountValue).toBe(15)
  })
})

/**
 * `GetDiscountCodeResponse` from GET /discounts/codes/{code}
 * (https://docs.brinkcommerce.com/technical/api-references/management/discount/discounts.md):
 * required code, created, discountCodeRuleId, isUnlimited, updated,
 * usageLimit, sequenceNumber; optional validDateRange { from, to }.
 */
describe('transformDiscountCode (brink-commerce)', () => {
  const raw: RawBrinkDiscountCodeResponse = {
    code: 'SPRING10',
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-02T00:00:00Z',
    discountCodeRuleId: 'rule-spring',
    isUnlimited: false,
    usageLimit: 500,
    sequenceNumber: 3,
    validDateRange: { from: '2024-03-15T00:00:00Z', to: '2024-04-15T00:00:00Z' },
  }

  it('parses against DiscountSchema with the code as its id', () => {
    const out = DiscountSchema.parse(transformDiscountCode(raw))
    expect(out).toMatchObject({
      id: 'SPRING10',
      code: 'SPRING10',
      usageLimit: 500,
      startsAt: '2024-03-15T00:00:00.000Z',
      endsAt: '2024-04-15T00:00:00.000Z',
      createdAt: '2024-03-01T00:00:00.000Z',
    })
  })

  it('reports no usage limit for an unlimited code', () => {
    expect(transformDiscountCode({ ...raw, isUnlimited: true }).usageLimit).toBeUndefined()
  })

  it('leaves type and value unset (they live in the rule outcomes)', () => {
    const out = transformDiscountCode(raw)
    expect(out.type).toBeUndefined()
    expect(out.value).toBeUndefined()
    expect(out.metadata['discountCodeRuleId']).toBe('rule-spring')
  })

  it('has no dates when validDateRange is absent', () => {
    const out = transformDiscountCode({ ...raw, validDateRange: undefined })
    expect(out.startsAt).toBeUndefined()
    expect(out.endsAt).toBeUndefined()
  })
})
