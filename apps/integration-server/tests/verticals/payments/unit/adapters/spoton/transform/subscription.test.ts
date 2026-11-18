import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/spoton/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('spoton transformSubscription', () => {
  it('maps an active subscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_spoton_1',
      object: 'subscription',
      customer: 'cus_spoton_1',
      status: 'active',
      currency: 'usd',
      items: {
        data: [
          {
            id: 'si_1',
            price: { id: 'price_1', product: 'prod_1', unit_amount: 2999, currency: 'usd' },
            quantity: 1,
          },
        ],
      },
      current_period_start: 1709251200,
      current_period_end: 1711929600,
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub_spoton_1')
    expect(result.customerId).toBe('cus_spoton_1')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.priceId).toBe('price_1')
    expect(result.gateway).toBe('stripe')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "canceled" status to "cancelled"', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_spoton_2',
      object: 'subscription',
      customer: 'cus_spoton_2',
      status: 'canceled',
      currency: 'eur',
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "unpaid" status to "expired"', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_spoton_3',
      object: 'subscription',
      customer: 'cus_spoton_3',
      status: 'unpaid',
      currency: 'gbp',
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformSubscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_spoton_4',
      object: 'subscription',
      customer: 'cus_spoton_4',
      status: 'active',
      currency: 'usd',
      default_payment_method: 'pm_1',
      cancel_at_period_end: false,
      items: { data: [{ id: 'si_1', price: { id: 'price_1' }, quantity: 2 }] },
      created: 1709251200,
    }
    const canonical = transformSubscription(raw)
    const back = untransformSubscription(canonical)
    expect(back.customer).toBe('cus_spoton_4')
    expect(back.default_payment_method).toBe('pm_1')
    expect(back.cancel_at_period_end).toBe(false)
  })
})
