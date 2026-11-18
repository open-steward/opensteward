import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('zuora transformSubscription', () => {
  it('maps id, customerId, status and currency correctly', () => {
    const raw: RawStripeSubscription = {
      id: 'zuora-sub-001',
      object: 'subscription',
      customer: 'cus-zuora-01',
      status: 'active',
      currency: 'usd',
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('zuora-sub-001')
    expect(result.customerId).toBe('cus-zuora-01')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "canceled" to "cancelled"', () => {
    const raw: RawStripeSubscription = {
      id: 'zuora-sub-002',
      object: 'subscription',
      customer: 'cus-zuora-02',
      status: 'canceled',
      currency: 'eur',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps past_due status and trial dates', () => {
    const raw: RawStripeSubscription = {
      id: 'zuora-sub-003',
      object: 'subscription',
      customer: 'cus-zuora-03',
      status: 'past_due',
      currency: 'gbp',
      trial_start: 1709251200,
      trial_end: 1711843200,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(result.trialStart).toBeDefined()
    expect(result.trialEnd).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformSubscription', () => {
    const raw: RawStripeSubscription = {
      id: 'zuora-sub-004',
      object: 'subscription',
      customer: 'cus-rt',
      status: 'active',
      currency: 'usd',
      default_payment_method: 'pm-rt',
      collection_method: 'send_invoice',
    }
    const result = transformSubscription(raw)
    const back = untransformSubscription(result)
    expect(back.customer).toBe('cus-rt')
    expect(back.default_payment_method).toBe('pm-rt')
    expect(back.collection_method).toBe('send_invoice')
  })
})
