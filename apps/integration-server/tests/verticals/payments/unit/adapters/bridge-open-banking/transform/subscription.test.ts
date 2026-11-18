import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('bridge-open-banking transformSubscription', () => {
  it('maps an active subscription with items', () => {
    const raw: RawStripeSubscription = {
      id: 'sub-001',
      object: 'subscription',
      customer: 'cus-001',
      status: 'active',
      currency: 'usd',
      items: {
        data: [
          {
            id: 'si-001',
            price: { id: 'price-001', product: 'prod-001', unit_amount: 999, currency: 'usd' },
            quantity: 1,
          },
        ],
      },
      current_period_start: 1709251200,
      current_period_end: 1711843200,
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-001')
    expect(result.customerId).toBe('cus-001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].priceId).toBe('price-001')
    expect(result.items[0].amount).toBe(999)
    expect(result.gateway).toBe('stripe')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled subscription', () => {
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

  it('round-trips customerId through untransformSubscription', () => {
    const raw: RawStripeSubscription = {
      id: 'sub-003',
      object: 'subscription',
      customer: 'cus-003',
      status: 'active',
      currency: 'usd',
      items: { data: [] },
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    const back = untransformSubscription(result)
    expect(back.customer).toBe('cus-003')
  })
})
