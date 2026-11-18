import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/sumup/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('sumup transformSubscription', () => {
  it('maps id, customerId, status, currency and gateway', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_001',
      object: 'subscription',
      customer: 'cus_abc',
      status: 'active',
      currency: 'usd',
      items: { data: [] },
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub_001')
    expect(result.externalId).toBe('sub_001')
    expect(result.customerId).toBe('cus_abc')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status values correctly', () => {
    const statuses: Array<{ raw: string; expected: string }> = [
      { raw: 'trialing', expected: 'trialing' },
      { raw: 'active', expected: 'active' },
      { raw: 'past_due', expected: 'past_due' },
      { raw: 'canceled', expected: 'cancelled' },
      { raw: 'unpaid', expected: 'expired' },
      { raw: 'incomplete_expired', expected: 'expired' },
      { raw: 'paused', expected: 'paused' },
      { raw: 'incomplete', expected: 'incomplete' },
      { raw: 'unknown_val', expected: 'active' },
    ]
    for (const { raw: rawStatus, expected } of statuses) {
      const raw: RawStripeSubscription = {
        id: 'sub_s',
        object: 'subscription',
        customer: 'cus_x',
        status: rawStatus,
        currency: 'usd',
        items: { data: [] },
      }
      expect(transformSubscription(raw).status).toBe(expected)
    }
  })

  it('maps subscription items with priceId, productId and quantity', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_002',
      object: 'subscription',
      customer: 'cus_abc',
      status: 'active',
      currency: 'usd',
      items: {
        data: [
          {
            id: 'si_001',
            price: { id: 'price_abc', product: 'prod_abc', unit_amount: 999 },
            quantity: 3,
          },
        ],
      },
    }
    const result = transformSubscription(raw)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('si_001')
    expect(result.items[0].priceId).toBe('price_abc')
    expect(result.items[0].productId).toBe('prod_abc')
    expect(result.items[0].quantity).toBe(3)
    expect(result.items[0].amount).toBe(999)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps period dates, trial dates and cancelAt from unix timestamps', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_003',
      object: 'subscription',
      customer: 'cus_abc',
      status: 'trialing',
      currency: 'usd',
      items: { data: [] },
      current_period_start: 1709251200,
      current_period_end: 1711929600,
      trial_start: 1709251200,
      trial_end: 1711929600,
      cancel_at: 1714521600,
    }
    const result = transformSubscription(raw)
    expect(result.currentPeriodStart).toBe('2024-03-01T00:00:00.000Z')
    expect(result.trialStart).toBe('2024-03-01T00:00:00.000Z')
    expect(result.cancelAt).not.toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps collectionMethod, defaultPaymentMethodId and latestInvoiceId', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_004',
      object: 'subscription',
      customer: 'cus_abc',
      status: 'active',
      currency: 'usd',
      items: { data: [] },
      collection_method: 'send_invoice',
      default_payment_method: 'pm_abc',
      latest_invoice: 'inv_abc',
    }
    const result = transformSubscription(raw)
    expect(result.collectionMethod).toBe('send_invoice')
    expect(result.defaultPaymentMethodId).toBe('pm_abc')
    expect(result.latestInvoiceId).toBe('inv_abc')
  })
})

describe('sumup untransformSubscription', () => {
  it('roundtrips customerId and items', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_rt',
      object: 'subscription',
      customer: 'cus_rt',
      status: 'active',
      currency: 'usd',
      items: {
        data: [{ id: 'si_rt', price: { id: 'price_rt', product: 'prod_rt' }, quantity: 2 }],
      },
    }
    const transformed = transformSubscription(raw)
    const back = untransformSubscription(transformed)
    expect(back.customer).toBe('cus_rt')
    expect(Array.isArray(back.items)).toBe(true)
    expect((back.items as Array<{ price: string; quantity: number }>)[0].price).toBe('price_rt')
    expect((back.items as Array<{ price: string; quantity: number }>)[0].quantity).toBe(2)
  })

  it('roundtrips cancelAtPeriodEnd and collectionMethod', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_rt2',
      object: 'subscription',
      customer: 'cus_x',
      status: 'active',
      currency: 'usd',
      items: { data: [] },
      cancel_at_period_end: true,
      collection_method: 'charge_automatically',
    }
    const transformed = transformSubscription(raw)
    const back = untransformSubscription(transformed)
    expect(back.cancel_at_period_end).toBe(true)
    expect(back.collection_method).toBe('charge_automatically')
  })

  it('roundtrips defaultPaymentMethodId', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_rt3',
      object: 'subscription',
      customer: 'cus_x',
      status: 'active',
      currency: 'usd',
      items: { data: [] },
      default_payment_method: 'pm_rt',
    }
    const transformed = transformSubscription(raw)
    const back = untransformSubscription(transformed)
    expect(back.default_payment_method).toBe('pm_rt')
  })

  it('omits fields that are undefined', () => {
    const back = untransformSubscription({})
    expect(Object.keys(back)).toHaveLength(0)
  })
})
