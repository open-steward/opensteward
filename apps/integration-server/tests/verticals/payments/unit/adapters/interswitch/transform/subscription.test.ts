import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/interswitch/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('interswitch transformSubscription', () => {
  it('maps an active subscription with items', () => {
    const raw: RawStripeSubscription = {
      id: 'sub-001',
      object: 'subscription',
      customer: 'cust-001',
      status: 'active',
      currency: 'usd',
      collection_method: 'charge_automatically',
      items: {
        data: [
          {
            id: 'si-001',
            price: { id: 'price-001', product: 'prod-001', unit_amount: 2999, currency: 'usd' },
            quantity: 1,
          },
        ],
      },
      current_period_start: 1709251200,
      current_period_end: 1711929600,
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-001')
    expect(result.customerId).toBe('cust-001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].priceId).toBe('price-001')
    expect(result.gateway).toBe('stripe')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a canceled subscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub-002',
      object: 'subscription',
      customer: 'cust-002',
      status: 'canceled',
      currency: 'eur',
      canceled_at: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformSubscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub-003',
      object: 'subscription',
      customer: 'cust-003',
      status: 'active',
      currency: 'usd',
      collection_method: 'send_invoice',
      cancel_at_period_end: true,
    }
    const canonical = transformSubscription(raw)
    const back = untransformSubscription(canonical)
    expect(back.customer).toBe('cust-003')
    expect(back.collection_method).toBe('send_invoice')
    expect(back.cancel_at_period_end).toBe(true)
  })
})
