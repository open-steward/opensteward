import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawRecurlySubscription,
} from '../../../../../../../src/verticals/payments/adapters/recurly/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('recurly transformSubscription', () => {
  it('maps an active subscription correctly', () => {
    const raw: RawRecurlySubscription = {
      id: 'sub-001',
      uuid: 'uuid-sub-001',
      state: 'active',
      account: { id: 'acc-001', code: 'code-001' },
      plan: { id: 'plan-001', code: 'pro-monthly' },
      currency: 'USD',
      unit_amount: 29.99,
      quantity: 1,
      current_period_started_at: '2024-03-01T00:00:00Z',
      current_period_ends_at: '2024-04-01T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-001')
    expect(result.externalId).toBe('uuid-sub-001')
    expect(result.customerId).toBe('acc-001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('plan-001')
    expect(result.gateway).toBe('recurly')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled subscription correctly', () => {
    const raw: RawRecurlySubscription = {
      id: 'sub-002',
      uuid: 'uuid-sub-002',
      state: 'canceled',
      account: { id: 'acc-002' },
      currency: 'EUR',
      canceled_at: '2024-03-15T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBe('2024-03-15T00:00:00Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps an expired subscription correctly', () => {
    const raw: RawRecurlySubscription = {
      id: 'sub-003',
      uuid: 'uuid-sub-003',
      state: 'expired',
      account: { id: 'acc-003' },
      currency: 'GBP',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a future subscription to incomplete status', () => {
    const raw: RawRecurlySubscription = {
      id: 'sub-004',
      uuid: 'uuid-sub-004',
      state: 'future',
      account: { id: 'acc-004' },
      currency: 'USD',
      trial_started_at: '2024-04-01T00:00:00Z',
      trial_ends_at: '2024-04-15T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(result.trialStart).toBe('2024-04-01T00:00:00Z')
    expect(result.trialEnd).toBe('2024-04-15T00:00:00Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
