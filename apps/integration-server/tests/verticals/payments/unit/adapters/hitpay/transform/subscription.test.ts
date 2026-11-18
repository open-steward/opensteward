import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawHitpayRecurringBilling,
} from '../../../../../../../src/verticals/payments/adapters/hitpay/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('hitpay transformSubscription', () => {
  it('maps an active recurring billing record correctly', () => {
    const raw: RawHitpayRecurringBilling = {
      id: 'rb-001',
      business_recurring_plans_id: 'plan-001',
      customer_email: 'cust@example.com',
      customer_name: 'Jane Doe',
      name: 'Pro Monthly',
      cycle: 'monthly',
      cycle_repeat: 1,
      currency: 'SGD',
      amount: '29.99',
      status: 'active',
      times_to_be_charged: 12,
      times_charged: 3,
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
      expires_at: '2025-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('cust@example.com')
    expect(result.currency).toBe('SGD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.amount).toBe(2999)
    expect(result.cancelAtPeriodEnd).toBe(false)
    expect(result.gateway).toBe('hitpay')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "inactive" status to "expired"', () => {
    const raw: RawHitpayRecurringBilling = {
      id: 'rb-002',
      customer_email: 'other@example.com',
      status: 'inactive',
      amount: '10.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "retrying" status to "incomplete" and sets dunningState', () => {
    const raw: RawHitpayRecurringBilling = {
      id: 'rb-003',
      customer_email: 'retry@example.com',
      status: 'retrying',
      amount: '15.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(result.dunningState).toBe('retrying')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('produces empty items array when amount is null', () => {
    const raw: RawHitpayRecurringBilling = {
      id: 'rb-004',
      customer_email: 'noamt@example.com',
      status: 'active',
      amount: null,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
