import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  untransformDiscount,
  type RawCentraVoucher,
} from '../../../../../../../src/verticals/ecommerce/adapters/centra/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'

function makeVoucher(overrides: Partial<RawCentraVoucher> = {}): RawCentraVoucher {
  return {
    voucherId: 500,
    code: 'SUMMER20',
    name: 'Summer 20% off',
    type: 'percent',
    value: 20,
    currency: 'SEK',
    startDate: '2024-06-01T00:00:00Z',
    stopDate: '2024-08-31T00:00:00Z',
    timesUsed: 3,
    usesLeft: 97,
    ...overrides,
  }
}

describe('transformDiscount', () => {
  it('maps voucherId to id string', () => {
    const result = transformDiscount(makeVoucher())
    expect(result.id).toBe('500')
  })

  it('maps code and title', () => {
    const result = transformDiscount(makeVoucher())
    expect(result.code).toBe('SUMMER20')
    expect(result.title).toBe('Summer 20% off')
  })

  it('maps "percent" type to PERCENTAGE', () => {
    const result = transformDiscount(makeVoucher())
    expect(result.type).toBe('PERCENTAGE')
    // Percentage value is kept as-is (not converted to minor units)
    expect(result.value).toBe(20)
  })

  it('maps "fixed" type to FIXED_AMOUNT and converts to minor units', () => {
    const result = transformDiscount(makeVoucher({ type: 'fixed', value: 10, currency: 'SEK' }))
    expect(result.type).toBe('FIXED_AMOUNT')
    // 10 SEK → 1000 minor units
    expect(result.value).toBe(1000)
  })

  it('maps "freeShipping" type to FREE_SHIPPING', () => {
    const result = transformDiscount(makeVoucher({ type: 'freeShipping' }))
    expect(result.type).toBe('FREE_SHIPPING')
    expect(result.appliesTo).toBe('SHIPPING')
  })

  it('maps "percent" voucher appliesTo ORDER', () => {
    const result = transformDiscount(makeVoucher())
    expect(result.appliesTo).toBe('ORDER')
  })

  it('maps usageCount from timesUsed', () => {
    const result = transformDiscount(makeVoucher())
    expect(result.usageCount).toBe(3)
  })

  it('computes usageLimit as timesUsed + usesLeft', () => {
    const result = transformDiscount(makeVoucher())
    // 3 + 97 = 100
    expect(result.usageLimit).toBe(100)
  })

  it('leaves usageLimit undefined when usesLeft is null', () => {
    const result = transformDiscount(makeVoucher({ usesLeft: null }))
    expect(result.usageLimit).toBeUndefined()
  })

  it('maps startsAt and endsAt (toIsoDatetime normalizes to .000Z form)', () => {
    const result = transformDiscount(makeVoucher())
    // toIsoDatetime converts via new Date().toISOString() which emits .000Z milliseconds
    expect(result.startsAt).toBe('2024-06-01T00:00:00.000Z')
    expect(result.endsAt).toBe('2024-08-31T00:00:00.000Z')
  })

  it('produces a payload that satisfies DiscountSchema', () => {
    const result = transformDiscount(makeVoucher())
    expect(() => DiscountSchema.parse(result)).not.toThrow()
  })

  it('round-trips type via untransformDiscount', () => {
    const canonical = transformDiscount(makeVoucher())
    const raw = untransformDiscount(canonical)
    expect(raw.code).toBe('SUMMER20')
    expect(raw.type).toBe('percent')
    expect(raw.value).toBe(20)
  })
})
