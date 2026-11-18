/**
 * Fixture: the "Get all plans" example of the official collection,
 * https://documenter.gw.postman.com/api/collections/7907941/2s93JusNJt
 */
import { describe, it, expect } from 'vitest'
import {
  transformPlan,
  type RawNowpaymentsplan,
} from '../../../../../../../src/verticals/payments/adapters/nowpayments/transform/plan'
import { PlanSchema } from '../../../../../../../src/verticals/payments/schema/plan'

const DOC: RawNowpaymentsplan = {
  id: '76215585',
  title: 'second sub plan',
  interval_day: '3',
  ipn_callback_url: null,
  success_url: null,
  cancel_url: null,
  partially_paid_url: null,
  amount: 0.1,
  currency: 'USD',
  created_at: '2022-10-04T16:10:06.214Z',
  updated_at: '2022-10-04T16:10:06.214Z',
}

describe('nowpayments transformPlan', () => {
  it('maps the documented plan: every interval_day days', () => {
    const p = PlanSchema.parse(transformPlan(DOC))
    expect(p).toMatchObject({
      id: '76215585',
      externalId: '76215585',
      nickname: 'second sub plan',
      amount: 10,
      currency: 'USD',
      interval: 'day',
      intervalCount: 3,
      gateway: 'nowpayments',
      createdAt: '2022-10-04T16:10:06.214Z',
      updatedAt: '2022-10-04T16:10:06.214Z',
    })
    expect(p.active).toBeUndefined()
  })

  it('throws on a missing currency instead of defaulting', () => {
    expect(() => transformPlan({ ...DOC, currency: null })).toThrow(/currency/)
  })

  it('throws on an interval_day that is not a whole number of days', () => {
    expect(() => transformPlan({ ...DOC, interval_day: null })).toThrow(/interval_day/)
    expect(() => transformPlan({ ...DOC, interval_day: '0' })).toThrow(/interval_day/)
  })

  it('throws on a missing amount', () => {
    expect(() => transformPlan({ ...DOC, amount: null })).toThrow(/amount/)
  })
})
