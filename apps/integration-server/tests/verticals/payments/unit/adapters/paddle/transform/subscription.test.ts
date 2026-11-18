import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawPaddleSubscription,
} from '../../../../../../../src/verticals/payments/adapters/paddle/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('paddle transformSubscription', () => {
  it('maps an active Paddle subscription to canonical Subscription', () => {
    const raw: RawPaddleSubscription = {
      id: 'sub_paddle_001',
      status: 'active',
      customer_id: 'ctm_001',
      currency_code: 'usd',
      items: [
        {
          price: { id: 'pri_001', unit_price: { amount: '1999' } },
          quantity: 2,
        },
        {
          price: { id: 'pri_002', unit_price: { amount: '499' } },
          quantity: 1,
        },
      ],
      current_billing_period: {
        starts_at: '2024-05-01T00:00:00Z',
        ends_at: '2024-06-01T00:00:00Z',
      },
      next_billed_at: '2024-06-01T00:00:00Z',
      custom_data: { plan_tier: 'business' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-05-01T00:00:00Z',
    }
    const result = transformSubscription(raw)

    expect(result.id).toBe('sub_paddle_001')
    expect(result.externalId).toBe('sub_paddle_001')
    expect(result.customerId).toBe('ctm_001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]!.id).toBe('sub_paddle_001-0')
    expect(result.items[0]!.priceId).toBe('pri_001')
    expect(result.items[0]!.quantity).toBe(2)
    expect(result.items[0]!.amount).toBe(1999)
    expect(result.items[1]!.priceId).toBe('pri_002')
    expect(result.items[1]!.amount).toBe(499)
    expect(result.currentPeriodStart).toBe('2024-05-01T00:00:00Z')
    expect(result.currentPeriodEnd).toBe('2024-06-01T00:00:00Z')
    expect(result.gateway).toBe('paddle')
    expect(result.metadata.plan_tier).toBe('business')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a trialing subscription', () => {
    const raw: RawPaddleSubscription = {
      id: 'sub_paddle_002',
      status: 'trialing',
      customer_id: 'ctm_002',
      currency_code: 'EUR',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('trialing')
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a canceled subscription', () => {
    const raw: RawPaddleSubscription = {
      id: 'sub_paddle_003',
      status: 'canceled',
      customer_id: 'ctm_003',
      currency_code: 'GBP',
      canceled_at: '2024-04-15T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBe('2024-04-15T00:00:00Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('sets cancelAt and cancelAtPeriodEnd from scheduled_change cancel action', () => {
    const raw: RawPaddleSubscription = {
      id: 'sub_paddle_004',
      status: 'active',
      customer_id: 'ctm_004',
      currency_code: 'USD',
      scheduled_change: {
        action: 'cancel',
        effective_at: '2024-06-01T00:00:00Z',
      },
      current_billing_period: {
        starts_at: '2024-05-01T00:00:00Z',
        ends_at: '2024-06-01T00:00:00Z',
      },
    }
    const result = transformSubscription(raw)
    expect(result.cancelAt).toBe('2024-06-01T00:00:00Z')
    expect(result.cancelAtPeriodEnd).toBe(true)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('does not set cancelAt when scheduled_change action is not cancel', () => {
    const raw: RawPaddleSubscription = {
      id: 'sub_paddle_005',
      status: 'active',
      customer_id: 'ctm_005',
      currency_code: 'USD',
      scheduled_change: {
        action: 'pause',
        effective_at: '2024-06-01T00:00:00Z',
      },
    }
    const result = transformSubscription(raw)
    expect(result.cancelAt).toBeUndefined()
    expect(result.cancelAtPeriodEnd).toBe(false)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
