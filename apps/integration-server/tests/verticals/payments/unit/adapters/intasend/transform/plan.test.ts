/**
 * Fixtures follow IntaSend's documented PlanSer (OpenAPI "IntaSend API" 1.0.1,
 * embedded in https://developers.intasend.com/reference/api_v1_subscriptions_plans_list):
 *
 *   "PlanSer":{…,"required":["amount","created_at","currency","frequency","name",
 *    "plan_id","plan_url","updated_at"]}
 *   "amount":{"type":"string","format":"decimal","pattern":"^-?\\d{0,13}(?:\\.\\d{0,2})?$"}
 *   "CurrencyEnum":{"type":"string","enum":["KES","GHS","NGN","UGX","TZS","XAF","XOF"],"description":"Supported currencies:...
 *   "FrequencyUnitEnum":{"enum":["D","W","M","Y"],"type":"string","description":"* `D` - day\n* `W` - week\n* `M` - month\n* `Y` - year"
 *
 * and the example response on https://developers.intasend.com/docs/create-a-subscription-plan.
 */
import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawIntasendPlan,
} from '../../../../../../../src/verticals/payments/adapters/intasend/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

/** The documented "Create a Plan Response" example. */
const DOC: RawIntasendPlan = {
  name: 'Basic',
  plan_id: 'LERG5RK',
  frequency: 1,
  frequency_unit: 'M',
  billing_cycles: 12,
  currency: 'KES',
  amount: '1000.00',
  created_at: '2023-10-05T10:25:25.499093+03:00',
  updated_at: '2023-10-05T10:25:25.499123+03:00',
}

describe('intasend transformPlan', () => {
  it('maps the documented PlanSer example', () => {
    const result = PlanSchema.parse(transformPlan(DOC))
    expect(result.id).toBe('LERG5RK')
    expect(result.externalId).toBe('LERG5RK')
    expect(result.nickname).toBe('Basic')
    expect(result.amount).toBe(100000)
    expect(result.currency).toBe('KES')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.active).toBeUndefined()
    expect(result.metadata).toEqual({ billing_cycles: '12' })
    expect(result.gateway).toBe('intasend')
  })

  it.each([
    ['D', 'day'],
    ['W', 'week'],
    ['M', 'month'],
    ['Y', 'year'],
  ] as const)('maps frequency_unit %s to %s', (unit, interval) => {
    expect(PlanSchema.parse(transformPlan({ ...DOC, frequency_unit: unit })).interval).toBe(
      interval,
    )
  })

  it('scales by the currency exponent: UGX is zero-decimal', () => {
    const result = PlanSchema.parse(transformPlan({ ...DOC, currency: 'UGX', amount: '5000.00' }))
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('UGX')
  })

  it('omits intervalCount for frequency 0 (documented minimum is 0, canonical is 1)', () => {
    expect(PlanSchema.parse(transformPlan({ ...DOC, frequency: 0 })).intervalCount).toBeUndefined()
  })

  it('throws on an undocumented frequency_unit instead of guessing month', () => {
    expect(() => transformPlan({ ...DOC, frequency_unit: 'Q' })).toThrow(/frequency_unit/)
  })

  it('throws when the required amount is missing, never writing 0', () => {
    expect(() => transformPlan({ ...DOC, amount: undefined })).toThrow(/amount/)
  })

  it('throws when the required currency is missing, never defaulting one', () => {
    expect(() => transformPlan({ ...DOC, currency: undefined })).toThrow(/currency/)
  })

  it('throws when the required plan_id is missing, never inventing an id', () => {
    expect(() => transformPlan({ ...DOC, plan_id: undefined, id: 77 })).toThrow(/plan_id/)
  })
})
