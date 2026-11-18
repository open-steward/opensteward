import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/payoneer/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('payoneer transformSubscription', () => {
  it('maps an active subscription with items', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_001',
      object: 'subscription',
      customer: 'cus_001',
      status: 'active',
      currency: 'usd',
      default_payment_method: 'pm_001',
      items: {
        data: [
          {
            id: 'si_001',
            price: { id: 'price_001', product: 'prod_001', unit_amount: 9900, currency: 'usd' },
            quantity: 1,
          },
        ],
      },
      current_period_start: 1709251200,
      current_period_end: 1711929600,
      created: 1709251200,
    }

    const result = transformSubscription(raw)

    expect(result.id).toBe('sub_001')
    expect(result.customerId).toBe('cus_001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('si_001')
    expect(result.defaultPaymentMethodId).toBe('pm_001')
    expect(result.gateway).toBe('stripe')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled subscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_002',
      object: 'subscription',
      customer: 'cus_002',
      status: 'canceled',
      currency: 'EUR',
      items: { data: [] },
      canceled_at: 1709251200,
      created: 1709251200,
    }

    const result = transformSubscription(raw)

    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformSubscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_003',
      object: 'subscription',
      customer: 'cus_003',
      status: 'active',
      currency: 'GBP',
      default_payment_method: 'pm_003',
      items: {
        data: [{ id: 'si_003', price: { id: 'price_003' }, quantity: 2 }],
      },
      cancel_at_period_end: false,
      metadata: { plan: 'pro' },
      created: 1709251200,
    }

    const canonical = transformSubscription(raw)
    const back = untransformSubscription(canonical)

    expect(back.customer).toBe('cus_003')
    expect(back.default_payment_method).toBe('pm_003')
    expect(Array.isArray(back.items)).toBe(true)
    expect(() => SubscriptionSchema.parse(canonical)).not.toThrow()
  })
})
