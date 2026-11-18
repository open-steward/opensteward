import { describe, it, expect } from 'vitest'
import { transformSubscription } from '../../../../../../../src/verticals/payments/adapters/payabli/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'
import { SUBSCRIPTIONS_LIST, SUBSCRIPTION_RECORD } from '../fixtures/documented'

describe('payabli transformSubscription', () => {
  it('maps the documented subscription list record', () => {
    const s = SubscriptionSchema.parse(transformSubscription(SUBSCRIPTIONS_LIST.Records[0]))
    expect(s.id).toBe('580')
    expect(s.customerId).toBe('4440')
    expect(s.status).toBe('active')
    expect(s.currency).toBe('USD')
    expect(s.items).toEqual([{ id: '580', amount: 10000 }])
    expect(s.currentPeriodStart).toBe('2024-01-02T14:32:11.000Z')
    expect(s.currentPeriodEnd).toBe('2024-07-20T00:00:00.000Z')
    expect(s.billingAnchor).toBe('2024-07-20T00:00:00.000Z')
    expect(s.createdAt).toBe('2023-12-14T08:51:10.000Z')
    expect(s.updatedAt).toBe('2023-12-14T08:51:10.000Z')
  })

  it('maps the documented GET /Subscription/{subId} body', () => {
    const s = SubscriptionSchema.parse(transformSubscription(SUBSCRIPTION_RECORD))
    expect(s.id).toBe(String(SUBSCRIPTION_RECORD.IdSub))
  })

  it('omits the item rather than guessing a currency', () => {
    const { PaymentData: _p, ...rest } = SUBSCRIPTIONS_LIST.Records[0]
    const s = SubscriptionSchema.parse(transformSubscription(rest))
    expect(s.currency).toBeUndefined()
    expect(s.items).toEqual([])
  })

  it.each([
    [0, 'paused'],
    [1, 'active'],
    [7, 'unknown'],
  ] as const)('maps SubStatus %s to %s', (SubStatus, status) => {
    const s = transformSubscription({ ...SUBSCRIPTIONS_LIST.Records[0], SubStatus })
    expect(SubscriptionSchema.parse(s).status).toBe(status)
  })

  it('throws without Customer.customerId', () => {
    expect(() =>
      transformSubscription({ ...SUBSCRIPTIONS_LIST.Records[0], Customer: undefined }),
    ).toThrow(/customerId/)
  })
})
