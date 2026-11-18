import { describe, it, expect } from 'vitest'
import {
  mapSubscriptionStatus,
  transformSubscription,
} from '../../../../../../../src/verticals/payments/adapters/paydock/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'
import { DOC_SUBSCRIPTION } from '../fixtures/docs'

describe('paydock transformSubscription', () => {
  it('maps the documented subscriptions/get example', () => {
    const s = SubscriptionSchema.parse(transformSubscription(DOC_SUBSCRIPTION))
    expect(s.id).toBe('5ef064763dcfec0ac5e0622e')
    expect(s.customerId).toBe('5ef064763dcfec0ac5e0622b')
    expect(s.status).toBe('expired')
    expect(s.currency).toBe('AUD')
    expect(s.createdAt).toBe('2020-06-22T07:57:42.963Z')
    expect(s.updatedAt).toBe('2020-06-29T07:58:15.049Z')
    expect(s.items).toEqual([])
  })

  it('maps the documented Status table', () => {
    expect(mapSubscriptionStatus('active')).toBe('active')
    expect(mapSubscriptionStatus('held')).toBe('paused')
    expect(mapSubscriptionStatus('deleted')).toBe('cancelled')
    expect(mapSubscriptionStatus('complete')).toBe('expired')
    expect(mapSubscriptionStatus('expired')).toBe('expired')
    expect(mapSubscriptionStatus('failed')).toBe('unknown')
    expect(mapSubscriptionStatus('trialing')).toBe('unknown')
  })

  it('throws without customer.customer_id (there is no top-level customer_id)', () => {
    const { customer: _c, ...rest } = DOC_SUBSCRIPTION
    expect(() => transformSubscription({ ...rest, customer_id: 'x' })).toThrow(/customer_id/)
  })
})
