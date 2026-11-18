import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/zip-bnpl/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('zip-bnpl transformSubscription', () => {
  it('maps id, customerId, status and currency correctly', () => {
    const raw: RawStripeSubscription = {
      id: 'zip-sub-001',
      object: 'subscription',
      customer: 'cus-001',
      status: 'active',
      currency: 'usd',
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('zip-sub-001')
    expect(result.customerId).toBe('cus-001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "canceled" to "cancelled"', () => {
    const raw: RawStripeSubscription = {
      id: 'zip-sub-002',
      object: 'subscription',
      customer: 'cus-002',
      status: 'canceled',
      currency: 'eur',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps subscription items', () => {
    const raw: RawStripeSubscription = {
      id: 'zip-sub-003',
      object: 'subscription',
      customer: 'cus-003',
      status: 'active',
      currency: 'gbp',
      items: {
        data: [
          {
            id: 'si-001',
            price: { id: 'price-001', product: 'prod-001', unit_amount: 999 },
            quantity: 2,
          },
        ],
      },
    }
    const result = transformSubscription(raw)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].priceId).toBe('price-001')
    expect(result.items[0].quantity).toBe(2)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformSubscription', () => {
    const raw: RawStripeSubscription = {
      id: 'zip-sub-004',
      object: 'subscription',
      customer: 'cus-rt',
      status: 'active',
      currency: 'usd',
      default_payment_method: 'pm-rt',
      collection_method: 'charge_automatically',
    }
    const result = transformSubscription(raw)
    const back = untransformSubscription(result)
    expect(back.customer).toBe('cus-rt')
    expect(back.default_payment_method).toBe('pm-rt')
    expect(back.collection_method).toBe('charge_automatically')
  })
})
