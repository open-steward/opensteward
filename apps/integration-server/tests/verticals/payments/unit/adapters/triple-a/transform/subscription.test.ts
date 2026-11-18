import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('triple-a transformSubscription', () => {
  it('maps a trialing subscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub-ta-001',
      object: 'subscription',
      customer: 'cus-ta-001',
      status: 'trialing',
      currency: 'usd',
      items: {
        data: [
          {
            id: 'si-ta-001',
            price: { id: 'price-ta-001', product: 'prod-ta-001', unit_amount: 4900 },
            quantity: 1,
          },
        ],
      },
      trial_start: 1709251200,
      trial_end: 1711929600,
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-ta-001')
    expect(result.status).toBe('trialing')
    expect(result.customerId).toBe('cus-ta-001')
    expect(result.currency).toBe('USD')
    expect(result.items[0].priceId).toBe('price-ta-001')
    expect(result.trialStart).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a past_due subscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub-ta-002',
      object: 'subscription',
      customer: 'cus-ta-002',
      status: 'past_due',
      currency: 'EUR',
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('round-trips collectionMethod via untransformSubscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub-ta-003',
      object: 'subscription',
      customer: 'cus-ta-rt',
      status: 'active',
      currency: 'USD',
      collection_method: 'send_invoice',
      created: 1709251200,
    }
    const transformed = transformSubscription(raw)
    const back = untransformSubscription(transformed)
    expect(back.collection_method).toBe('send_invoice')
  })
})
