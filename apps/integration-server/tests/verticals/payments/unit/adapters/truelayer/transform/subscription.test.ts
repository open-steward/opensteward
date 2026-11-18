import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('truelayer transformSubscription', () => {
  it('maps an active subscription with items', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_tl_001',
      object: 'subscription',
      customer: 'cus_tl_001',
      status: 'active',
      currency: 'usd',
      items: {
        data: [
          {
            id: 'si_tl_001',
            price: { id: 'price_tl_001', product: 'prod_tl_001', unit_amount: 9900 },
            quantity: 1,
          },
        ],
      },
      current_period_start: 1709251200,
      current_period_end: 1711929600,
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub_tl_001')
    expect(result.customerId).toBe('cus_tl_001')
    expect(result.status).toBe('active')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].priceId).toBe('price_tl_001')
    expect(result.gateway).toBe('stripe')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled subscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_tl_002',
      object: 'subscription',
      customer: 'cus_tl_002',
      status: 'canceled',
      currency: 'eur',
      created: 1709337600,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformSubscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_tl_003',
      object: 'subscription',
      customer: 'cus_tl_003',
      status: 'active',
      currency: 'gbp',
      created: 1709424000,
    }
    const subscription = transformSubscription(raw)
    const back = untransformSubscription(subscription)
    expect(back.customer).toBe('cus_tl_003')
  })
})
