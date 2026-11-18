/**
 * Fixture: the List Subscriptions by Product response row,
 * https://docs.rapyd.net/en/list-subscriptions.html (product and tiers
 * trimmed), plus a per_unit plan variant for the item amount.
 */
import { describe, it, expect } from 'vitest'
import { transformSubscription } from '../../../../../../../src/verticals/payments/adapters/rapyd/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

const DOC_SUB = {
  id: 'sub_b2db5191d9623a958697614d665a5be5',
  billing: 'pay_automatically',
  billing_cycle_anchor: 1761221727,
  created_at: 1761221727,
  customer_token: 'cus_4e25112ac20e144ad073a614dc46934b',
  days_until_due: 30,
  metadata: {},
  tax_percent: 0,
  cancel_at_period_end: false,
  canceled_at: null,
  current_period_end: 1766492127,
  current_period_start: 1761221727,
  discount: null,
  ended_at: null,
  subscription_items: {
    data: [
      {
        id: 'subi_fd4d2d48578564f16c3c19d3e09612b9',
        created: 1761221727,
        metadata: null,
        quantity: 1,
        plan: {
          id: 'plan_9338044c6ca654abd79da7319c40b7dc',
          aggregate_usage: 'sum',
          amount: 0,
          billing_scheme: 'tiered',
          created_at: 1761210135,
          currency: 'USD',
          interval: 'month',
          interval_count: 2,
          metadata: {},
          product: { id: 'product_88fde8f1365082b50e8f4b37127edd99' },
          nickname: 'SaaS Users',
          tiers_mode: 'volume',
          usage_type: 'licensed',
          active: true,
        },
      },
    ],
    has_more: false,
    total_count: 1,
    url: '/v1/subscription_items?subscription=sub_b2db5191d9623a958697614d665a5be5',
  },
  status: 'active',
  trial_end: null,
  trial_start: null,
  payment_method: 'card_b9548d9b53a565b2315fecdc6c87f158',
  payment_fields: null,
  payout_fields: null,
  type: 'payment',
  simultaneous_invoice: true,
}

describe('rapyd transformSubscription', () => {
  it('maps the documented row and parses as a canonical Subscription', () => {
    const r = SubscriptionSchema.parse(transformSubscription(DOC_SUB))
    expect(r.id).toBe('sub_b2db5191d9623a958697614d665a5be5')
    expect(r.externalId).toBe(r.id)
    expect(r.customerId).toBe('cus_4e25112ac20e144ad073a614dc46934b')
    expect(r.status).toBe('active')
    expect(r.collectionMethod).toBe('charge_automatically')
    expect(r.defaultPaymentMethodId).toBe('card_b9548d9b53a565b2315fecdc6c87f158')
    expect(r.currentPeriodStart).toBe(new Date(1761221727 * 1000).toISOString())
    expect(r.currentPeriodEnd).toBe(new Date(1766492127 * 1000).toISOString())
    expect(r.cancelAtPeriodEnd).toBe(false)
    expect(r.cancelledAt).toBeUndefined()
    expect(r.currency).toBeUndefined()
    expect(r.items).toEqual([
      {
        id: 'subi_fd4d2d48578564f16c3c19d3e09612b9',
        priceId: 'plan_9338044c6ca654abd79da7319c40b7dc',
        productId: 'product_88fde8f1365082b50e8f4b37127edd99',
        quantity: 1,
        // tiered: the plan's amount 0 is not its price, so no amount.
        amount: undefined,
        metadata: undefined,
      },
    ])
  })

  it('reads a per_unit plan amount in the plan currency', () => {
    const item = DOC_SUB.subscription_items.data[0]!
    const raw = {
      ...DOC_SUB,
      subscription_items: {
        data: [{ ...item, plan: { ...item.plan, billing_scheme: 'per_unit', amount: 9.99 } }],
      },
    }
    const r = SubscriptionSchema.parse(transformSubscription(raw))
    expect(r.items[0]!.amount).toBe(999)
  })

  it('scales a per_unit item amount by the plan currency exponent, not a hard-coded 100', () => {
    const item = DOC_SUB.subscription_items.data[0]!
    const raw = {
      ...DOC_SUB,
      subscription_items: {
        data: [
          {
            ...item,
            plan: { ...item.plan, billing_scheme: 'per_unit', amount: 500, currency: 'JPY' },
          },
        ],
      },
    }
    const r = SubscriptionSchema.parse(transformSubscription(raw))
    expect(r.items[0]!.amount).toBe(500)
  })

  it.each([
    ['active', 'active'],
    ['trialing', 'trialing'],
    ['past_due', 'past_due'],
    ['canceled', 'cancelled'],
    ['unpaid', 'past_due'],
    ['whatever', 'unknown'],
  ])('maps documented status %s to %s', (status, want) => {
    expect(SubscriptionSchema.parse(transformSubscription({ ...DOC_SUB, status })).status).toBe(
      want,
    )
  })

  it('maps billing send_invoice', () => {
    const r = SubscriptionSchema.parse(
      transformSubscription({ ...DOC_SUB, billing: 'send_invoice' }),
    )
    expect(r.collectionMethod).toBe('send_invoice')
  })

  it('throws when customer_token is absent instead of inventing one', () => {
    expect(() => transformSubscription({ ...DOC_SUB, customer_token: undefined })).toThrow(
      /customer_token/,
    )
  })
})
