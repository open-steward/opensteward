import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/yapily/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('yapily transformSubscription (stripe-scaffold)', () => {
  it('maps an active subscription with items', () => {
    const raw: RawStripeSubscription = {
      id: 'sub-001',
      object: 'subscription',
      customer: 'cus-001',
      status: 'active',
      currency: 'usd',
      collection_method: 'charge_automatically',
      items: {
        data: [
          {
            id: 'si-001',
            price: { id: 'price-001', product: 'prod-001', unit_amount: 5000, currency: 'usd' },
            quantity: 1,
          },
        ],
      },
      current_period_start: 1709251200,
      current_period_end: 1711929600,
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('cus-001')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].priceId).toBe('price-001')
    expect(result.gateway).toBe('stripe')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps canceled status to "cancelled"', () => {
    const raw: RawStripeSubscription = {
      id: 'sub-002',
      object: 'subscription',
      customer: 'cus-002',
      status: 'canceled',
      currency: 'gbp',
      items: { data: [] },
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformSubscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub-003',
      object: 'subscription',
      customer: 'cus-003',
      status: 'trialing',
      currency: 'eur',
      collection_method: 'send_invoice',
      items: { data: [] },
      created: 1709251200,
    }
    const canonical = transformSubscription(raw)
    expect(() => SubscriptionSchema.parse(canonical)).not.toThrow()
    const out = untransformSubscription(canonical)
    expect(out.customer).toBe('cus-003')
    expect(out.collection_method).toBe('send_invoice')
  })
})
