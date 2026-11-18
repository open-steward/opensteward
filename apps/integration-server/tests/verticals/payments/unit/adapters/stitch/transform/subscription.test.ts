import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  untransformSubscription,
  type RawStripeSubscription,
  type RawStripeSubscriptionItem,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('stitch transformSubscription', () => {
  it('maps id, customerId, status, currency, and gateway fields', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_stitch_001',
      object: 'subscription',
      customer: 'cus_001',
      status: 'active',
      currency: 'usd',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub_stitch_001')
    expect(result.externalId).toBe('sub_stitch_001')
    expect(result.customerId).toBe('cus_001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('stripe')
  })

  it('upper-cases currency', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_stitch_002',
      object: 'subscription',
      customer: 'cus_002',
      status: 'active',
      currency: 'eur',
    }
    const result = transformSubscription(raw)
    expect(result.currency).toBe('EUR')
  })

  it('maps status "canceled" to "cancelled"', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_stitch_003',
      object: 'subscription',
      customer: 'cus_003',
      status: 'canceled',
      currency: 'usd',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
  })

  it('maps status "unpaid" to "expired"', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_stitch_004',
      object: 'subscription',
      customer: 'cus_004',
      status: 'unpaid',
      currency: 'usd',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
  })

  it('maps items with priceId, productId, quantity, and amount', () => {
    const items: RawStripeSubscriptionItem[] = [
      {
        id: 'si_001',
        price: { id: 'price_001', product: 'prod_001', unit_amount: 9999, currency: 'usd' },
        quantity: 2,
      },
    ]
    const raw: RawStripeSubscription = {
      id: 'sub_stitch_005',
      object: 'subscription',
      customer: 'cus_005',
      status: 'active',
      currency: 'usd',
      items: { data: items },
    }
    const result = transformSubscription(raw)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('si_001')
    expect(result.items[0].priceId).toBe('price_001')
    expect(result.items[0].productId).toBe('prod_001')
    expect(result.items[0].quantity).toBe(2)
    expect(result.items[0].amount).toBe(9999)
  })

  it('maps period, billing anchor, and trial dates from unix timestamps', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_stitch_006',
      object: 'subscription',
      customer: 'cus_006',
      status: 'trialing',
      currency: 'usd',
      current_period_start: 1709251200,
      current_period_end: 1711929600,
      billing_cycle_anchor: 1709251200,
      trial_start: 1709251200,
      trial_end: 1711929600,
    }
    const result = transformSubscription(raw)
    expect(result.currentPeriodStart).toBe('2024-03-01T00:00:00.000Z')
    expect(result.currentPeriodEnd).toMatch(/^2024-04-/)
    expect(result.billingAnchor).toBe('2024-03-01T00:00:00.000Z')
    expect(result.trialStart).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps cancelAt, cancelledAt, and cancelAtPeriodEnd', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_stitch_007',
      object: 'subscription',
      customer: 'cus_007',
      status: 'active',
      currency: 'usd',
      cancel_at: 1711929600,
      canceled_at: 1709251200,
      cancel_at_period_end: true,
    }
    const result = transformSubscription(raw)
    expect(result.cancelAt).toMatch(/^2024-04-/)
    expect(result.cancelledAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.cancelAtPeriodEnd).toBe(true)
  })

  it('maps collectionMethod, defaultPaymentMethodId, and latestInvoiceId', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_stitch_008',
      object: 'subscription',
      customer: 'cus_008',
      status: 'active',
      currency: 'usd',
      collection_method: 'send_invoice',
      default_payment_method: 'pm_001',
      latest_invoice: 'inv_001',
    }
    const result = transformSubscription(raw)
    expect(result.collectionMethod).toBe('send_invoice')
    expect(result.defaultPaymentMethodId).toBe('pm_001')
    expect(result.latestInvoiceId).toBe('inv_001')
  })

  it('converts unix created to ISO string', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_stitch_009',
      object: 'subscription',
      customer: 'cus_009',
      status: 'active',
      currency: 'usd',
      created: 1709251200,
    }
    const result = transformSubscription(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes SubscriptionSchema validation', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_stitch_010',
      object: 'subscription',
      customer: 'cus_010',
      status: 'active',
      currency: 'gbp',
      collection_method: 'charge_automatically',
      items: {
        data: [
          {
            id: 'si_010',
            price: { id: 'price_010', product: 'prod_010', unit_amount: 4999 },
            quantity: 1,
          },
        ],
      },
      current_period_start: 1709251200,
      current_period_end: 1711929600,
      created: 1709251200,
      metadata: { ref: 'S-010' },
    }
    const result = transformSubscription(raw)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('round-trips through untransformSubscription preserving customerId and items', () => {
    const raw: RawStripeSubscription = {
      id: 'sub_stitch_011',
      object: 'subscription',
      customer: 'cus_roundtrip',
      status: 'active',
      currency: 'usd',
      collection_method: 'charge_automatically',
      cancel_at_period_end: false,
      default_payment_method: 'pm_rt',
      items: {
        data: [
          {
            id: 'si_rt',
            price: { id: 'price_rt', product: 'prod_rt', unit_amount: 2999 },
            quantity: 3,
          },
        ],
      },
      metadata: { note: 'roundtrip' },
    }
    const canonical = transformSubscription(raw)
    const back = untransformSubscription(canonical)
    expect(back.customer).toBe('cus_roundtrip')
    expect(back.default_payment_method).toBe('pm_rt')
    expect(back.collection_method).toBe('charge_automatically')
    expect(back.cancel_at_period_end).toBe(false)
    expect(Array.isArray(back.items)).toBe(true)
    expect((back.items as Array<{ price: string; quantity: number }>)[0].price).toBe('price_rt')
    expect((back.items as Array<{ price: string; quantity: number }>)[0].quantity).toBe(3)
  })
})
