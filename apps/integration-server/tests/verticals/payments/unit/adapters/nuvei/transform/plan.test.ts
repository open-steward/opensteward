/**
 * transformPlan over the documented getPlansList.do example response
 * (https://docs.nuvei.com/api/advanced/indexAdvanced.html#getplanslist).
 */
import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawNuveiPlan,
} from '../../../../../../../src/verticals/payments/adapters/nuvei/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

/** The plan object of the documented example response, verbatim. */
const DOC_PLAN: RawNuveiPlan = {
  recurringAmount: '4.24',
  startAfter: { month: '2', year: '1', day: '3' },
  recurringPeriod: { month: '0', year: '0', day: '1' },
  merchantId: '2502136204546424962',
  initialAmount: '15.67',
  name: '8SQ1TOWCQ285KON',
  description: 'Plan 1',
  planStatus: 'ACTIVE',
  planId: 101,
  currency: 'EUR',
  endAfter: { month: '7', year: '8', day: '6' },
}

describe('nuvei transformPlan', () => {
  it('maps the documented example plan', () => {
    const result = PlanSchema.parse(transformPlan(DOC_PLAN))
    expect(result).toMatchObject({
      id: '101',
      externalId: '101',
      nickname: '8SQ1TOWCQ285KON',
      active: true,
      amount: 424,
      currency: 'EUR',
      interval: 'day',
      intervalCount: 1,
      gateway: 'nuvei',
      metadata: { description: 'Plan 1', initialAmount: '15.67' },
    })
    expect(result.createdAt).toBeUndefined()
    expect(result.raw).toBe(DOC_PLAN)
  })

  it('maps planStatus INACTIVE to active=false', () => {
    const result = PlanSchema.parse(transformPlan({ ...DOC_PLAN, planStatus: 'INACTIVE' }))
    expect(result.active).toBe(false)
  })

  it.each([
    [{ day: '7', month: '0', year: '0' }, 'week', 1],
    [{ day: '0', month: '1', year: '0' }, 'month', 1],
    [{ day: '0', month: '3', year: '0' }, 'month', 3],
    [{ day: '0', month: '0', year: '1' }, 'year', 1],
    [{ day: '14', month: '0', year: '0' }, 'day', 14],
  ] as const)('maps recurringPeriod %j to %s x%i', (recurringPeriod, interval, count) => {
    const result = PlanSchema.parse(transformPlan({ ...DOC_PLAN, recurringPeriod }))
    expect(result.interval).toBe(interval)
    expect(result.intervalCount).toBe(count)
  })

  it('throws on a mixed period (the docs\' "Day = 15 Month = 9"), which has no canonical interval', () => {
    expect(() =>
      transformPlan({ ...DOC_PLAN, recurringPeriod: { day: '15', month: '9', year: '0' } }),
    ).toThrow(/recurringPeriod/)
  })

  it('throws on a missing or all-zero period instead of assuming monthly', () => {
    expect(() => transformPlan({ ...DOC_PLAN, recurringPeriod: undefined })).toThrow(
      /recurringPeriod/,
    )
    expect(() =>
      transformPlan({ ...DOC_PLAN, recurringPeriod: { day: '0', month: '0', year: '0' } }),
    ).toThrow(/recurringPeriod/)
  })

  it('scales recurringAmount by the currency exponent, not a fixed x100', () => {
    expect(transformPlan({ ...DOC_PLAN, recurringAmount: '1000', currency: 'JPY' }).amount).toBe(
      1000,
    )
    expect(transformPlan({ ...DOC_PLAN, recurringAmount: '4.24' }).amount).toBe(424)
  })

  it('throws instead of defaulting a missing currency, amount or id', () => {
    expect(() => transformPlan({ ...DOC_PLAN, currency: undefined })).toThrow(/currency/)
    expect(() => transformPlan({ ...DOC_PLAN, recurringAmount: undefined })).toThrow(
      /recurringAmount/,
    )
    expect(() => transformPlan({ ...DOC_PLAN, planId: undefined })).toThrow(/planId/)
  })
})
