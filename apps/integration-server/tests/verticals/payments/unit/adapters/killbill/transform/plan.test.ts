import { describe, it, expect } from 'vitest'
import { transformPlanDetail } from '../../../../../../../src/verticals/payments/adapters/killbill/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

// First entry of the "Retrieve available base plans" example, https://killbill.github.io/slate/catalog.html
const DOC_PLAN_DETAIL = {
  product: 'Sports',
  plan: 'sports-monthly',
  priceList: 'DEFAULT',
  finalPhaseBillingPeriod: 'MONTHLY',
  finalPhaseRecurringPrice: [
    { currency: 'GBP', value: 375 },
    { currency: 'USD', value: 500 },
  ],
}

describe('killbill transformPlanDetail', () => {
  it('yields one plan per currency of the final-phase recurring price', () => {
    const plans = transformPlanDetail(DOC_PLAN_DETAIL).map((p) => PlanSchema.parse(p))
    expect(plans.map((p) => [p.id, p.amount, p.currency])).toEqual([
      ['sports-monthly:GBP', 37500, 'GBP'],
      ['sports-monthly:USD', 50000, 'USD'],
    ])
    expect(plans[0]!.externalId).toBe('sports-monthly')
    expect(plans[0]!.productId).toBe('Sports')
    expect(plans[0]!.interval).toBe('month')
    expect(plans[0]!.intervalCount).toBe(1)
  })

  it('maps multi-unit billing periods and skips NO_BILLING_PERIOD', () => {
    const at = (p: string) =>
      transformPlanDetail({ ...DOC_PLAN_DETAIL, finalPhaseBillingPeriod: p })[0]
    expect([at('QUARTERLY')!.interval, at('QUARTERLY')!.intervalCount]).toEqual(['month', 3])
    expect([at('BIWEEKLY')!.interval, at('BIWEEKLY')!.intervalCount]).toEqual(['week', 2])
    expect([at('TRIENNIAL')!.interval, at('TRIENNIAL')!.intervalCount]).toEqual(['year', 3])
    expect([at('THIRTY_DAYS')!.interval, at('THIRTY_DAYS')!.intervalCount]).toEqual(['day', 30])
    expect([at('SESQUIENNIAL')!.interval, at('SESQUIENNIAL')!.intervalCount]).toEqual(['month', 18])
    expect(
      transformPlanDetail({ ...DOC_PLAN_DETAIL, finalPhaseBillingPeriod: 'NO_BILLING_PERIOD' }),
    ).toEqual([])
  })
})
