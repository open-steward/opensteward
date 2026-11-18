import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawRebillySubscription,
} from '../../../../../../../src/verticals/payments/adapters/rebilly/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

// Subscription.yaml / SubscriptionOrOneTimeSaleItem.yaml.
const base: RawRebillySubscription = {
  id: 'sub_01HRF27SATGE4Z6PBJE6PD8328',
  orderType: 'subscription-order',
  customerId: 'cus_1',
  status: 'active',
  inTrial: false,
  currency: 'USD',
  items: [{ id: 'item_1', quantity: 2, plan: { id: 'plan_0YV7DENSVGDBW9S71XZNNYYQ0X' } }],
  currentPeriodStart: '2026-01-01T00:00:00Z',
  currentPeriodEnd: '2026-02-01T00:00:00Z',
  paymentInstrumentId: 'inst_0YVB8KPKNXCBR9EDX7JHSED75N',
  recentInvoiceId: 'in_0YVF9605RKC62BP14NE2R7V2XT',
  canceledTime: null,
  createdTime: '2026-01-01T00:00:00Z',
}

describe('rebilly transformSubscription', () => {
  it('maps the documented fields', () => {
    const s = SubscriptionSchema.parse(transformSubscription(base))
    expect(s).toMatchObject({
      customerId: 'cus_1',
      status: 'active',
      currency: 'USD',
      items: [{ id: 'item_1', quantity: 2, priceId: 'plan_0YV7DENSVGDBW9S71XZNNYYQ0X' }],
      defaultPaymentMethodId: 'inst_0YVB8KPKNXCBR9EDX7JHSED75N',
      latestInvoiceId: 'in_0YVF9605RKC62BP14NE2R7V2XT',
    })
    expect(s.cancelledAt).toBeUndefined()
  })

  it.each([
    [{ status: 'active', inTrial: true }, 'trialing'],
    [{ status: 'pending' }, 'incomplete'],
    [{ status: 'paused' }, 'paused'],
    [{ status: 'canceled' }, 'cancelled'],
    [{ status: 'voided' }, 'cancelled'],
    [{ status: 'churned' }, 'expired'],
    [{ status: 'trial-ended' }, 'expired'],
    [{ status: 'abandoned' }, 'unknown'],
  ] as const)('maps %o to %s', (patch, status) => {
    expect(SubscriptionSchema.parse(transformSubscription({ ...base, ...patch })).status).toBe(
      status,
    )
  })

  it('reads trial end only when the trial is enabled', () => {
    const on = transformSubscription({
      ...base,
      trial: { enabled: true, endTime: '2026-01-10T00:00:00Z' },
    })
    expect(on.trialEnd).toBe('2026-01-10T00:00:00Z')
    expect(
      transformSubscription({ ...base, trial: { enabled: false, endTime: null } }).trialEnd,
    ).toBeUndefined()
  })

  it('throws without a customerId', () => {
    expect(() => transformSubscription({ ...base, customerId: undefined })).toThrow(/customerId/)
  })

  it('ignores a trial endTime when the trial is not enabled', () => {
    expect(
      transformSubscription({ ...base, trial: { enabled: false, endTime: '2026-01-10T00:00:00Z' } })
        .trialEnd,
    ).toBeUndefined()
    expect(
      transformSubscription({ ...base, trial: { endTime: '2026-01-10T00:00:00Z' } }).trialEnd,
    ).toBeUndefined()
  })

  it('upper-cases a lower-case ISO 4217 currency', () => {
    expect(
      SubscriptionSchema.parse(transformSubscription({ ...base, currency: 'eur' })).currency,
    ).toBe('EUR')
  })
})
