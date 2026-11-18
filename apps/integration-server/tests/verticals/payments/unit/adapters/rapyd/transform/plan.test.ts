/**
 * Fixture: the first row of the List Plans response example,
 * https://docs.rapyd.net/en/list-plans.html.
 */
import { describe, it, expect } from 'vitest'
import { transformPlan } from '../../../../../../../src/verticals/payments/adapters/rapyd/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

const DOC_PLAN = {
  id: 'plan_69dbb4984da69a24b32e464db94cc354',
  aggregate_usage: 'sum',
  amount: 9.99,
  billing_scheme: 'per_unit',
  created_at: 1761210640,
  currency: 'USD',
  interval: 'month',
  interval_count: 1,
  metadata: {},
  product: { id: 'product_8bd3eeef73cb7213415cd1e3797319b0' },
  nickname: 'Unlimited Plan',
  tiers: [],
  tiers_mode: '',
  transform_usage: { divide_by: 0, round: 'up' },
  trial_period_days: 7,
  usage_type: 'licensed',
  active: false,
}

describe('rapyd transformPlan', () => {
  it('maps the documented List Plans row and parses as a canonical Plan', () => {
    const r = PlanSchema.parse(transformPlan(DOC_PLAN))
    expect(r.id).toBe('plan_69dbb4984da69a24b32e464db94cc354')
    expect(r.externalId).toBe(r.id)
    expect(r.productId).toBe('product_8bd3eeef73cb7213415cd1e3797319b0')
    expect(r.nickname).toBe('Unlimited Plan')
    expect(r.active).toBe(false)
    expect(r.amount).toBe(999)
    expect(r.currency).toBe('USD')
    expect(r.interval).toBe('month')
    expect(r.intervalCount).toBe(1)
    expect(r.trialPeriodDays).toBe(7)
    expect(r.createdAt).toBe(new Date(1761210640 * 1000).toISOString())
    expect(r.gateway).toBe('rapyd')
  })

  it.each(['day', 'week', 'month', 'year'])('maps documented interval %s', (interval) => {
    expect(PlanSchema.parse(transformPlan({ ...DOC_PLAN, interval })).interval).toBe(interval)
  })

  it('refuses a tiered plan instead of reporting its placeholder amount 0', () => {
    // The documented tiered example (List Subscriptions by Product) has amount: 0.
    expect(() => transformPlan({ ...DOC_PLAN, billing_scheme: 'tiered', amount: 0 })).toThrow(
      /per_unit/,
    )
  })

  it('throws rather than defaulting a missing currency, amount or interval', () => {
    expect(() => transformPlan({ ...DOC_PLAN, currency: undefined })).toThrow(/currency/)
    expect(() => transformPlan({ ...DOC_PLAN, amount: undefined })).toThrow(/amount/)
    expect(() => transformPlan({ ...DOC_PLAN, interval: undefined })).toThrow(/interval/)
  })

  it('does not invent active when absent', () => {
    const { active: _drop, ...rest } = DOC_PLAN
    expect(PlanSchema.parse(transformPlan(rest)).active).toBeUndefined()
  })
})
