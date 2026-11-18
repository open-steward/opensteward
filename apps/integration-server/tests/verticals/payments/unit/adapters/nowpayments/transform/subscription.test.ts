/**
 * Fixture: the "Get many recurring payments" example of the official
 * collection, https://documenter.gw.postman.com/api/collections/7907941/2s93JusNJt
 */
import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawNowpaymentsSubscription,
} from '../../../../../../../src/verticals/payments/adapters/nowpayments/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

const BY_CUSTOMER: RawNowpaymentsSubscription = {
  id: '1515573197',
  subscription_plan_id: '111394288',
  is_active: true,
  status: 'PAID',
  expire_date: '2022-10-11T00:02:00.025Z',
  subscriber: { sub_partner_id: '111394288' },
  created_at: '2022-10-09T22:15:50.808Z',
  updated_at: '2022-10-09T22:15:50.808Z',
}

const BY_EMAIL: RawNowpaymentsSubscription = {
  id: '111394288',
  subscription_plan_id: '111394288',
  is_active: false,
  status: 'WAITING_PAY',
  expire_date: '2022-10-07T16:46:00.910Z',
  subscriber: { email: 'test@example.com' },
  created_at: '2022-10-06T16:40:28.880Z',
  updated_at: '2022-10-06T16:40:28.880Z',
}

describe('nowpayments transformSubscription', () => {
  it('maps a customer (sub-partner) subscriber to its customer id', () => {
    const s = SubscriptionSchema.parse(transformSubscription(BY_CUSTOMER))
    expect(s).toMatchObject({
      id: '1515573197',
      customerId: '111394288',
      status: 'active',
      items: [],
      gateway: 'nowpayments',
      createdAt: '2022-10-09T22:15:50.808Z',
    })
    expect(s.metadata).toMatchObject({ subscription_plan_id: '111394288', is_active: 'true' })
  })

  it('maps an e-mail subscriber to the e-mail', () => {
    const s = SubscriptionSchema.parse(transformSubscription(BY_EMAIL))
    expect(s.customerId).toBe('test@example.com')
    expect(s.status).toBe('incomplete')
    expect(s.metadata.subscriber_email).toBe('test@example.com')
  })

  it('prefers the sub_partner_id (the id listCustomers returns) over the e-mail', () => {
    const s = SubscriptionSchema.parse(
      transformSubscription({
        ...BY_CUSTOMER,
        subscriber: { sub_partner_id: '111394288', email: 'test@example.com' },
      }),
    )
    expect(s.customerId).toBe('111394288')
  })

  it.each([
    ['WAITING_PAY', 'incomplete'],
    ['PAID', 'active'],
    ['PARTIALLY_PAID', 'incomplete'],
    ['EXPIRED', 'expired'],
    ['SOMETHING_NEW', 'unknown'],
  ])('maps status %s to %s', (st, want) => {
    expect(
      SubscriptionSchema.parse(transformSubscription({ ...BY_CUSTOMER, status: st })).status,
    ).toBe(want)
  })

  it('throws when the subscriber has neither a sub_partner_id nor an email', () => {
    expect(() => transformSubscription({ ...BY_CUSTOMER, subscriber: {} })).toThrow(/subscriber/)
  })
})
