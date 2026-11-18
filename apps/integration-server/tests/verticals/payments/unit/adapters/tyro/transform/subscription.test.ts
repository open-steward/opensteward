import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/tyro/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('tyro transformSubscription', () => {
  it('maps an active subscription with items', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_tyro_001',
      object: 'subscription',
      customer: 'cus_tyro_001',
      status: 'active',
      currency: 'aud',
      items: {
        data: [
          {
            id: 'si_tyro_001',
            price: { id: 'price_tyro_001', product: 'prod_tyro_001', unit_amount: 4900 },
            quantity: 1,
          },
        ],
      },
      current_period_start: 1709251200,
      current_period_end: 1711929600,
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub_tyro_001')
    expect(result.customerId).toBe('cus_tyro_001')
    expect(result.status).toBe('active')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].priceId).toBe('price_tyro_001')
    expect(result.gateway).toBe('stripe')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a past_due subscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_tyro_002',
      object: 'subscription',
      customer: 'cus_tyro_002',
      status: 'past_due',
      currency: 'aud',
      created: 1709337600,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformSubscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_tyro_003',
      object: 'subscription',
      customer: 'cus_tyro_003',
      status: 'active',
      currency: 'aud',
      cancel_at_period_end: true,
      created: 1709424000,
    }
    const subscription = transformSubscription(raw)
    const back = untransformSubscription(subscription)
    expect(back.customer).toBe('cus_tyro_003')
    expect(back.cancel_at_period_end).toBe(true)
  })
})
