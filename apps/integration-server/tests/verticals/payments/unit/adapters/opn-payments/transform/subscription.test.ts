import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawOpnSubscription,
} from '../../../../../../../src/verticals/payments/adapters/opn-payments/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('opn-payments transformSubscription', () => {
  it('maps fields to canonical subscription', () => {
    const raw: RawOpnSubscription = {
      id: 'schd_test_123',
      customer: 'cust_test_456',
      status: 'active',
      plan: 'plan_monthly',
      charge: {
        amount: 50000,
        currency: 'thb',
      },
      next_occurrence_dates: ['2024-04-01T00:00:00Z', '2024-05-01T00:00:00Z'],
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('schd_test_123')
    expect(result.externalId).toBe('schd_test_123')
    expect(result.customerId).toBe('cust_test_456')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('THB')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('plan_monthly')
    expect(result.items[0].priceId).toBe('plan_monthly')
    expect(result.items[0].amount).toBe(50000)
    expect(result.currentPeriodStart).toBe('2024-04-01T00:00:00Z')
    expect(result.gateway).toBe('opn-payments')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('uses raw amount/currency when charge is absent', () => {
    const raw: RawOpnSubscription = {
      id: 'schd_nocharge',
      customer: 'cust_abc',
      status: 'running',
      amount: 20000,
      currency: 'usd',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.items[0].amount).toBe(20000)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "expiring" to paused', () => {
    const raw: RawOpnSubscription = {
      id: 'schd_paused',
      customer: 'cust_p',
      status: 'expiring',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "expired" to expired', () => {
    const raw: RawOpnSubscription = {
      id: 'schd_expired',
      customer: 'cust_e',
      status: 'expired',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "cancelled" to cancelled', () => {
    const raw: RawOpnSubscription = {
      id: 'schd_cancelled',
      customer: 'cust_c',
      status: 'deleted',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status "suspended" to past_due', () => {
    const raw: RawOpnSubscription = {
      id: 'schd_overdue',
      customer: 'cust_d',
      status: 'overdue',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('sets cancelledAt from ended_at', () => {
    const raw: RawOpnSubscription = {
      id: 'schd_end',
      customer: 'cust_x',
      status: 'expired',
      ended_at: '2024-06-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.cancelledAt).toBe('2024-06-01T00:00:00Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('stores period metadata', () => {
    const raw: RawOpnSubscription = {
      id: 'schd_meta',
      customer: 'cust_m',
      status: 'active',
      period: 1,
      period_unit: 'month',
      in_words: 'every month',
    }
    const result = transformSubscription(raw)
    expect(result.metadata['period']).toBe('1')
    expect(result.metadata['period_unit']).toBe('month')
    expect(result.metadata['in_words']).toBe('every month')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
