import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  subscriptionsOf,
} from '../../../../../../../src/verticals/payments/adapters/killbill/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

// Subscription inside the "List bundles" example, https://killbill.github.io/slate/bundle.html
export const DOC_SUBSCRIPTION = {
  accountId: '2ad52f53-85ae-408a-9879-32a7e59dd03d',
  bundleId: '2cd2f4b5-a1c0-42a7-924f-64c7b791332d',
  subscriptionId: '8ab101b6-15e8-433b-b4f7-f99eeaa56a77',
  externalKey: 'another_external_key',
  startDate: '2018-07-18',
  productName: 'Standard',
  productCategory: 'BASE',
  billingPeriod: 'MONTHLY',
  phaseType: 'TRIAL',
  priceList: 'DEFAULT',
  planName: 'standard-monthly',
  state: 'CANCELLED',
  sourceType: 'NATIVE',
  cancelledDate: '2018-07-19',
  chargedThroughDate: null,
  billingStartDate: '2018-07-18',
  billingEndDate: '2018-07-19',
  billCycleDayLocal: 17,
  events: [],
  priceOverrides: null,
  prices: [],
  auditLogs: [],
}

describe('killbill transformSubscription', () => {
  it('maps the documented subscription', () => {
    const s = SubscriptionSchema.parse(transformSubscription(DOC_SUBSCRIPTION))
    expect(s.id).toBe('8ab101b6-15e8-433b-b4f7-f99eeaa56a77')
    expect(s.customerId).toBe('2ad52f53-85ae-408a-9879-32a7e59dd03d')
    expect(s.status).toBe('cancelled')
    expect(s.items).toEqual([
      {
        id: '8ab101b6-15e8-433b-b4f7-f99eeaa56a77',
        priceId: 'standard-monthly',
        productId: 'Standard',
      },
    ])
    expect(s.createdAt).toBe('2018-07-18T00:00:00.000Z')
    expect(s.cancelledAt).toBe('2018-07-19T00:00:00.000Z')
    expect(s.currency).toBeUndefined()
  })

  it('reads cancelledDate as a scheduled stop (cancelAt) until state is CANCELLED', () => {
    const s = SubscriptionSchema.parse(
      transformSubscription({ ...DOC_SUBSCRIPTION, state: 'ACTIVE', phaseType: 'EVERGREEN' }),
    )
    expect(s.cancelAt).toBe('2018-07-19T00:00:00.000Z')
    expect(s.cancelledAt).toBeUndefined()
    expect(transformSubscription(DOC_SUBSCRIPTION).cancelAt).toBeUndefined()
  })

  it('carries the documented quantity onto the item', () => {
    const s = SubscriptionSchema.parse(transformSubscription({ ...DOC_SUBSCRIPTION, quantity: 3 }))
    expect(s.items[0]!.quantity).toBe(3)
  })

  it('maps the documented states', () => {
    const at = (state: string, phaseType = 'EVERGREEN') =>
      transformSubscription({ ...DOC_SUBSCRIPTION, state, phaseType }).status
    expect(at('ACTIVE')).toBe('active')
    expect(at('ACTIVE', 'TRIAL')).toBe('trialing')
    expect(at('BLOCKED')).toBe('paused')
    expect(at('EXPIRED')).toBe('expired')
    expect(at('PENDING')).toBe('incomplete')
    expect(at('SOMETHING')).toBe('unknown')
  })

  it('subscriptionsOf flattens a bundle and throws without an accountId', () => {
    expect(subscriptionsOf({ bundleId: 'b', subscriptions: [DOC_SUBSCRIPTION] })).toHaveLength(1)
    expect(subscriptionsOf({ bundleId: 'b', subscriptions: null })).toEqual([])
    expect(() => transformSubscription({ ...DOC_SUBSCRIPTION, accountId: undefined })).toThrow(
      /accountId/,
    )
  })
})
