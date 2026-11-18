/**
 * Fixture: the "Listado de planes" example response
 * (https://documents.openpay.mx/docs/api/index.html).
 */
import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawOpenpayPlan,
} from '../../../../../../../src/verticals/payments/adapters/openpay/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

const DOC: RawOpenpayPlan = {
  name: 'Curso de aleman',
  status: 'active',
  amount: 150,
  currency: 'MXN',
  id: 'patpflacwilazguj6bem',
  creation_date: '2013-12-13T09:43:52-06:00',
  repeat_every: 1,
  repeat_unit: 'month',
  retry_times: 2,
  status_after_retry: 'cancelled',
  trial_days: 60,
}

describe('openpay transformPlan', () => {
  it('maps the documented plan object', () => {
    const r = PlanSchema.parse(transformPlan(DOC))
    expect(r.id).toBe('patpflacwilazguj6bem')
    expect(r.nickname).toBe('Curso de aleman')
    expect(r.active).toBe(true)
    expect(r.amount).toBe(15000)
    expect(r.currency).toBe('MXN')
    expect(r.interval).toBe('month')
    expect(r.intervalCount).toBe(1)
    expect(r.trialPeriodDays).toBe(60)
    expect(r.createdAt).toBe('2013-12-13T09:43:52-06:00')
  })

  it('maps the documented week and year units and deleted status', () => {
    expect(PlanSchema.parse(transformPlan({ ...DOC, repeat_unit: 'week' })).interval).toBe('week')
    expect(
      PlanSchema.parse(transformPlan({ ...DOC, repeat_unit: 'year', repeat_every: 2 })),
    ).toMatchObject({
      interval: 'year',
      intervalCount: 2,
    })
    expect(transformPlan({ ...DOC, status: 'deleted' }).active).toBe(false)
  })

  it('throws on an undocumented repeat_unit rather than guessing one', () => {
    expect(() => transformPlan({ ...DOC, repeat_unit: 'days' })).toThrow(/repeat_unit/)
  })

  it('never defaults a missing currency', () => {
    const { currency: _c, ...rest } = DOC
    expect(() => transformPlan(rest)).toThrow(/no currency/)
  })

  it('leaves active unset when status is absent', () => {
    const { status: _s, ...rest } = DOC
    expect(PlanSchema.parse(transformPlan(rest)).active).toBeUndefined()
  })

  it('never defaults a missing id or amount', () => {
    const { id: _i, ...noId } = DOC
    expect(() => transformPlan(noId)).toThrow(/no id/)
    const { amount: _a, ...noAmount } = DOC
    expect(() => transformPlan(noAmount)).toThrow(/no numeric amount/)
  })
})
