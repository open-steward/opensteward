import { describe, it, expect } from 'vitest'
import { transformPlan } from '../../../../../../../src/verticals/payments/adapters/rebill/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'
import { documentedPlan } from '../fixtures/documented'

describe('rebill transformPlan', () => {
  it('maps the documented plan object from its default price', () => {
    const p = PlanSchema.parse(transformPlan(documentedPlan()))
    expect(p.id).toBe('pln_3724ff11fa5c4853bea5a22b2867191b')
    expect(p.nickname).toBe('Monthly Premium Plan')
    expect(p.active).toBe(true)
    expect(p.amount).toBe(9999)
    expect(p.currency).toBe('USD')
    expect(p.interval).toBe('month')
    expect(p.intervalCount).toBe(1)
    expect(p.metadata).toEqual({ internal_id: 'plan_premium_v2' })
    expect(p.createdAt).toBe('2026-04-10T12:00:00.000Z')
    expect(p.updatedAt).toBe('2026-04-10T12:00:00.000Z')
  })

  it('reads the price flagged isDefault, not the first one', () => {
    const raw = documentedPlan()
    raw.prices = [raw.prices[1]!, raw.prices[0]!]
    const p = PlanSchema.parse(transformPlan(raw))
    expect(p.currency).toBe('USD')
    expect(p.amount).toBe(9999)
  })

  it('maps year frequency, count, archived status and trialPeriodDays', () => {
    const p = PlanSchema.parse(
      transformPlan({
        ...documentedPlan(),
        status: 'archived',
        frequency: { period: 'year', count: 2 },
        trialPeriodDays: 14,
      }),
    )
    expect(p.interval).toBe('year')
    expect(p.intervalCount).toBe(2)
    expect(p.active).toBe(false)
    expect(p.trialPeriodDays).toBe(14)
  })

  it('throws when no price is flagged default', () => {
    const raw = documentedPlan()
    raw.prices = raw.prices.map((x) => ({ ...x, isDefault: false }))
    expect(() => transformPlan(raw)).toThrow(/no default price/)
  })

  it('throws on an undocumented frequency period', () => {
    expect(() =>
      transformPlan({ ...documentedPlan(), frequency: { period: 'fortnight', count: 1 } }),
    ).toThrow(/frequency period/)
  })
})
