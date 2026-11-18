import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawKauflandVoucher,
} from '../../../../../../../src/verticals/ecommerce/adapters/kaufland-marketplace/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeVoucher(overrides: Partial<RawKauflandVoucher> = {}): RawKauflandVoucher {
  return {
    id_voucher: 1001,
    code: 'SAVE10',
    type: 'percentage',
    percentage: 10,
    amount: null,
    currency: 'EUR',
    usage_limit: 100,
    usage_count: 5,
    valid_from_iso: '2024-03-01T00:00:00Z',
    valid_until_iso: '2024-12-31T23:59:59Z',
    ts_created_iso: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformDiscount (kaufland-marketplace)', () => {
  it('maps id_voucher to string id', () => {
    const result = transformDiscount(makeVoucher({ id_voucher: 42 }))
    expect(result.id).toBe('42')
  })

  it('falls back to code when id_voucher is null', () => {
    const result = transformDiscount(makeVoucher({ id_voucher: null, code: 'FALLBACK' }))
    expect(result.id).toBe('FALLBACK')
  })

  it('maps code', () => {
    const result = transformDiscount(makeVoucher())
    expect(result.code).toBe('SAVE10')
  })

  it('maps percentage type to PERCENTAGE', () => {
    const result = transformDiscount(makeVoucher({ type: 'percentage' }))
    expect(result.type).toBe('PERCENTAGE')
  })

  it('maps fixed type to FIXED_AMOUNT', () => {
    const result = transformDiscount(makeVoucher({ type: 'fixed', amount: 500, percentage: null }))
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('maps fixed_amount type to FIXED_AMOUNT', () => {
    const result = transformDiscount(
      makeVoucher({ type: 'fixed_amount', amount: 200, percentage: null }),
    )
    expect(result.type).toBe('FIXED_AMOUNT')
  })

  it('uses percentage field as value for PERCENTAGE type', () => {
    const result = transformDiscount(makeVoucher({ type: 'percentage', percentage: 15 }))
    expect(result.value).toBe(15)
  })

  it('uses amount field as value for FIXED_AMOUNT type', () => {
    const result = transformDiscount(makeVoucher({ type: 'fixed', amount: 999, percentage: null }))
    expect(result.value).toBe(999)
  })

  it('includes currency for FIXED_AMOUNT', () => {
    const result = transformDiscount(makeVoucher({ type: 'fixed', amount: 500, currency: 'EUR' }))
    expect(result.currency).toBe('EUR')
  })

  it('omits currency for PERCENTAGE', () => {
    const result = transformDiscount(makeVoucher({ type: 'percentage' }))
    expect(result.currency).toBeUndefined()
  })

  it('defaults currency to EUR when not specified', () => {
    const result = transformDiscount(makeVoucher({ type: 'fixed', amount: 100, currency: null }))
    expect(result.currency).toBe('EUR')
  })

  it('maps usage_limit', () => {
    const result = transformDiscount(makeVoucher({ usage_limit: 50 }))
    expect(result.usageLimit).toBe(50)
  })

  it('maps usage_count', () => {
    const result = transformDiscount(makeVoucher({ usage_count: 3 }))
    expect(result.usageCount).toBe(3)
  })

  it('maps valid_from_iso to startsAt', () => {
    const result = transformDiscount(makeVoucher())
    expect(result.startsAt).toBe('2024-03-01T00:00:00Z')
  })

  it('maps valid_until_iso to endsAt', () => {
    const result = transformDiscount(makeVoucher())
    expect(result.endsAt).toBe('2024-12-31T23:59:59Z')
  })

  it('maps ts_created_iso to createdAt', () => {
    const result = transformDiscount(makeVoucher())
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z')
  })

  it('stores raw payload in metadata', () => {
    const raw = makeVoucher()
    const result = transformDiscount(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying DiscountSchema', () => {
    const result = transformDiscount(makeVoucher())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('produces a schema-valid FIXED_AMOUNT discount', () => {
    const result = transformDiscount(makeVoucher({ type: 'fixed', amount: 500, percentage: null }))
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })
})

describe('untransformDiscount (kaufland-marketplace)', () => {
  it('maps PERCENTAGE type to percentage Kaufland type', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 10, code: 'SAVE10' })
    expect(body.type).toBe('percentage')
  })

  it('maps FIXED_AMOUNT type to fixed Kaufland type', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 500, code: 'FLAT5' })
    expect(body.type).toBe('fixed')
  })

  it('emits percentage field for PERCENTAGE type', () => {
    const body = untransformDiscount({ type: 'PERCENTAGE', value: 20 })
    expect(body.percentage).toBe(20)
  })

  it('emits amount field for FIXED_AMOUNT type', () => {
    const body = untransformDiscount({ type: 'FIXED_AMOUNT', value: 300, currency: 'EUR' })
    expect(body.amount).toBe(300)
  })

  it('round-trips code', () => {
    const canonical = transformDiscount(makeVoucher({ type: 'percentage', percentage: 10 }))
    const body = untransformDiscount(canonical)
    expect(body.code).toBe('SAVE10')
  })
})
