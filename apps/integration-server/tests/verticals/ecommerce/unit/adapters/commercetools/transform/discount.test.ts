import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  buildActionsForDiscount,
  type RawCtCartDiscount,
  type RawCtDiscountCode,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercetools/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeRule(overrides: Partial<RawCtCartDiscount> = {}): RawCtCartDiscount {
  return {
    id: 'disc-1',
    version: 1,
    name: { 'en-US': '10% off everything' },
    value: { type: 'relative', permyriad: 1000 },
    target: { type: 'lineItems' },
    sortOrder: '0.1',
    isActive: true,
    requiresDiscountCode: true,
    validFrom: '2024-06-01T00:00:00Z',
    validUntil: '2024-06-30T23:59:59Z',
    createdAt: '2024-05-01T00:00:00Z',
    ...overrides,
  }
}

function makeCode(): RawCtDiscountCode {
  return {
    id: 'code-1',
    version: 1,
    code: 'SUMMER10',
    cartDiscounts: [{ id: 'disc-1', typeId: 'cart-discount' }],
    isActive: true,
    maxApplications: 100,
    applicationsCount: 5,
  }
}

describe('transformDiscount (commercetools)', () => {
  it('maps relative (permyriad) value to canonical percentage', () => {
    const r = transformDiscount(makeRule(), makeCode())
    expect(r.type).toBe('PERCENTAGE')
    expect(r.value).toBe(10)
    expect(r.code).toBe('SUMMER10')
  })

  it('maps absolute money value to FIXED_AMOUNT + currency', () => {
    const rule = makeRule({
      value: {
        type: 'absolute',
        money: [{ centAmount: 1500, currencyCode: 'USD', fractionDigits: 2 }],
      },
    })
    const r = transformDiscount(rule)
    expect(r.type).toBe('FIXED_AMOUNT')
    expect(r.value).toBe(1500)
    expect(r.currency).toBe('USD')
  })

  it('maps target type lineItems to PRODUCTS', () => {
    const r = transformDiscount(makeRule())
    expect(r.appliesTo).toBe('PRODUCTS')
  })

  it('surfaces code usage counts from the discount code', () => {
    const r = transformDiscount(makeRule(), makeCode())
    expect(r.usageLimit).toBe(100)
    expect(r.usageCount).toBe(5)
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const r = transformDiscount(makeRule(), makeCode())
    expect(() => DiscountSchema.parse(r)).not.toThrow()
  })

  it('round-trips writable fields via untransformDiscount', () => {
    const canonical = transformDiscount(makeRule(), makeCode())
    const raw = untransformDiscount(canonical) as Record<string, unknown>
    const value = raw['value'] as { type: string; permyriad: number }
    expect(value.type).toBe('relative')
    expect(value.permyriad).toBe(1000)
    expect(raw['requiresDiscountCode']).toBe(true)
  })

  it('builds update actions from a partial patch', () => {
    const actions = buildActionsForDiscount(makeRule(), { title: 'Autumn 20' })
    expect(actions[0]!['action']).toBe('changeName')
  })
})
