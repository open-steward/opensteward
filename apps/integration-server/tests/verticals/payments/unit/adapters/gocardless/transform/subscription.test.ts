import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawGCSubscription,
} from '../../../../../../../src/verticals/payments/adapters/gocardless/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('gocardless transformSubscription', () => {
  it('maps an active subscription with upcoming payments', () => {
    const raw: RawGCSubscription = {
      id: 'SB001',
      status: 'active',
      amount: 1000,
      currency: 'gbp',
      name: 'Basic Plan',
      interval: 1,
      interval_unit: 'monthly',
      start_date: '2024-01-01T00:00:00Z',
      end_date: '2025-01-01T00:00:00Z',
      upcoming_payments: [
        { charge_date: '2024-02-01T00:00:00Z', amount: 1000 },
        { charge_date: '2024-03-01T00:00:00Z', amount: 1000 },
      ],
      links: { mandate: 'MD001', customer: 'CU001' },
      created_at: '2024-01-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('SB001')
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('CU001')
    expect(result.currency).toBe('GBP')
    expect(result.currentPeriodEnd).toBe('2024-02-01T00:00:00Z')
    expect(result.defaultPaymentMethodId).toBe('MD001')
    expect(result.billingAnchor).toBe('2024-01-01T00:00:00Z')
    expect(result.gateway).toBe('gocardless')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.amount).toBe(1000)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a paused subscription', () => {
    const raw: RawGCSubscription = {
      id: 'SB002',
      status: 'paused',
      amount: 500,
      currency: 'eur',
      links: { customer: 'CU002' },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(result.currency).toBe('EUR')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled subscription', () => {
    const raw: RawGCSubscription = {
      id: 'SB003',
      status: 'cancelled',
      amount: 2000,
      currency: 'gbp',
      links: { customer: 'CU003' },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a finished subscription to "expired"', () => {
    const raw: RawGCSubscription = {
      id: 'SB004',
      status: 'finished',
      amount: 750,
      currency: 'gbp',
      end_date: '2024-12-31T00:00:00Z',
      links: { customer: 'CU004' },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(result.currentPeriodEnd).toBe('2024-12-31T00:00:00Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps pending_customer_approval to "incomplete"', () => {
    const raw: RawGCSubscription = {
      id: 'SB005',
      status: 'pending_customer_approval',
      amount: 300,
      currency: 'gbp',
      links: { customer: 'CU005' },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
