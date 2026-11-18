import { describe, it, expect } from 'vitest'
import { transformSubscription } from '../../../../../../../src/verticals/payments/adapters/moneris/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'
import { SUBSCRIPTION } from '../fixtures'

describe('moneris transformSubscription', () => {
  it('maps the documented subscription', () => {
    const s = SubscriptionSchema.parse(transformSubscription(SUBSCRIPTION))
    expect(s.id).toBe('rp0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(s.externalId).toBe('rp0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(s.customerId).toBe('ci0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(s.status).toBe('active')
    expect(s.currency).toBe('CAD')
    expect(s.items).toEqual([{ id: 'rp0105ARZ3NDEKTSV4RRFFQ69G5FAV', amount: 2500 }])
    expect(s.defaultPaymentMethodId).toBe('pi0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(s.createdAt).toBe('2023-02-25T06:43:40.252Z')
    expect(s.updatedAt).toBe('2023-02-26T06:43:40.252Z')
  })

  // `currency`: "Provides the three letter currency code according the ISO 4217 standard." (getpayments.md)
  it('reads the currency from billingAmount, not a default', () => {
    const s = SubscriptionSchema.parse(
      transformSubscription({
        ...SUBSCRIPTION,
        billingInformation: {
          ...SUBSCRIPTION.billingInformation,
          billingAmount: { amount: 900, currency: 'USD' },
        },
      }),
    )
    expect(s.currency).toBe('USD')
    expect(s.items).toEqual([{ id: 'rp0105ARZ3NDEKTSV4RRFFQ69G5FAV', amount: 900 }])
  })

  it.each([
    ['PAUSED', 'paused'],
    ['CANCELED', 'cancelled'],
    ['COMPLETED', 'expired'],
    ['DECLINED_RETRY', 'past_due'],
    ['DECLINED', 'unknown'],
  ] as const)('maps subscriptionStatus %s to %s', (subscriptionStatus, status) => {
    expect(
      SubscriptionSchema.parse(transformSubscription({ ...SUBSCRIPTION, subscriptionStatus }))
        .status,
    ).toBe(status)
  })

  it('throws on a subscription with no customerId, rather than invent one', () => {
    expect(() => transformSubscription({ ...SUBSCRIPTION, customerId: null })).toThrow(/customerId/)
  })
})
