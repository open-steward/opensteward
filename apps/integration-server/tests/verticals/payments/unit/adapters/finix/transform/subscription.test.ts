import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawFinixSubscription,
} from '../../../../../../../src/verticals/payments/adapters/finix/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('finix transformSubscription', () => {
  it('maps an ACTIVE subscription with buyer details', () => {
    const raw: RawFinixSubscription = {
      id: 'SUBi1',
      state: 'ACTIVE',
      amount: 2999,
      currency: 'USD',
      billing_interval: 'MONTHLY',
      buyer_details: {
        identity_id: 'IDi1',
        instrument_id: 'PIi1',
      },
      first_charge_at: '2024-03-01T00:00:00.000Z',
      expires_at: '2025-03-01T00:00:00.000Z',
      subscription_plan_id: 'SPi1',
      created_at: '2024-03-01T00:00:00.000Z',
      updated_at: '2024-03-01T00:00:00.000Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('SUBi1')
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('IDi1')
    expect(result.defaultPaymentMethodId).toBe('PIi1')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.amount).toBe(2999)
    expect(result.gateway).toBe('finix')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELED state to "cancelled" and sets cancelledAt from updated_at', () => {
    const raw: RawFinixSubscription = {
      id: 'SUBi2',
      state: 'CANCELED',
      amount: 999,
      currency: 'USD',
      buyer_details: { identity_id: 'IDi2' },
      canceled_via: 'merchant',
      updated_at: '2024-04-01T00:00:00.000Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('does NOT set cancelledAt when canceled_via is null', () => {
    const raw: RawFinixSubscription = {
      id: 'SUBi3',
      state: 'CANCELED',
      amount: 500,
      currency: 'USD',
      buyer_details: { identity_id: 'IDi3' },
      canceled_via: null,
      updated_at: '2024-04-01T00:00:00.000Z',
    }
    const result = transformSubscription(raw)
    expect(result.cancelledAt).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps PAST_DUE state to "past_due"', () => {
    const raw: RawFinixSubscription = {
      id: 'SUBi4',
      state: 'PAST_DUE',
      amount: 1999,
      currency: 'USD',
      buyer_details: { identity_id: 'IDi4' },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps NOT_STARTED state to "incomplete"', () => {
    const raw: RawFinixSubscription = {
      id: 'SUBi5',
      state: 'NOT_STARTED',
      amount: 500,
      currency: 'USD',
      buyer_details: { identity_id: 'IDi5' },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps BILL_AUTOMATICALLY collection method', () => {
    const raw: RawFinixSubscription = {
      id: 'SUBi6',
      state: 'ACTIVE',
      amount: 1000,
      currency: 'USD',
      buyer_details: { identity_id: 'IDi6' },
      subscription_details: {
        collection_method: 'BILL_AUTOMATICALLY',
      },
    }
    const result = transformSubscription(raw)
    expect(result.collectionMethod).toBe('charge_automatically')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('returns empty items array when amount is null', () => {
    const raw: RawFinixSubscription = {
      id: 'SUBi7',
      state: 'ACTIVE',
      amount: null,
      currency: 'USD',
      buyer_details: { identity_id: 'IDi7' },
    }
    const result = transformSubscription(raw)
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
