import { describe, it, expect } from 'vitest'
import {
  transformDiscount,
  type RawDukaanCoupon,
} from '../../../../../../../src/verticals/ecommerce/adapters/dukaan/transform/discount'
import { DiscountSchema } from '../../../../../../../src/verticals/ecommerce/schema/discount'
import { COUPON_ROW } from '../fixtures'

const row = () => structuredClone(COUPON_ROW) as unknown as RawDukaanCoupon

describe('transformDiscount (documented get_discounts row)', () => {
  it('parses against DiscountSchema and maps the documented fields', () => {
    const d = DiscountSchema.parse(transformDiscount(row()))
    expect(d.id).toBe('46e00ecd-550c-4800-8679-09ca6f9d521c')
    expect(d.code).toBe('SAMPLE2')
    expect(d.title).toBeUndefined() // description is "" in the example
    expect(d.usageCount).toBe(0)
    expect(d.startsAt).toBe('2024-02-19T05:46:00.000Z')
    expect(d.endsAt).toBe('2024-02-27T18:29:00.000Z')
    expect(d.createdAt).toBe('2024-02-19T05:46:16.207Z')
    expect(d.metadata).toEqual(row())
  })

  it('maps no type, value or minimum: discount_type codes and the currency are undocumented', () => {
    const d = DiscountSchema.parse(transformDiscount(row()))
    expect(d.type).toBeUndefined()
    expect(d.value).toBeUndefined()
    expect(d.currency).toBeUndefined()
    expect(d.minimumPurchaseAmount).toBeUndefined()
  })

  it('maps applicable_on_all_customers only when true', () => {
    expect(DiscountSchema.parse(transformDiscount(row())).customerEligibility).toBeUndefined()
    const all = DiscountSchema.parse(
      transformDiscount({ ...row(), applicable_on_all_customers: true }),
    )
    expect(all.customerEligibility).toBe('ALL')
  })
})
