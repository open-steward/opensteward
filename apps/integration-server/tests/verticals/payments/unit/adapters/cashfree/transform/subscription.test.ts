import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawCashfreeSubscription,
} from '../../../../../../../src/verticals/payments/adapters/cashfree/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('cashfree transformSubscription', () => {
  it('maps an active subscription with plan details', () => {
    const raw: RawCashfreeSubscription = {
      subscription_id: 'sub-001',
      cf_subscription_id: 123,
      subscription_status: 'ACTIVE',
      subscription_first_charge_time: '2024-03-01T00:00:00Z',
      subscription_expiry_time: '2025-03-01T00:00:00Z',
      customer_details: {
        customer_email: 'jane@example.com',
        customer_phone: '+919876543210',
      },
      plan_details: {
        plan_id: 'plan-001',
        plan_name: 'Monthly Basic',
        plan_type: 'PERIODIC',
        plan_recurring_amount: 99,
        plan_currency: 'INR',
        plan_interval_type: 'MONTH',
        plan_intervals: 1,
      },
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-001')
    expect(result.customerId).toBe('jane@example.com')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('INR')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].amount).toBe(9900)
    expect(result.gateway).toBe('cashfree')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled subscription', () => {
    const raw: RawCashfreeSubscription = {
      subscription_id: 'sub-002',
      subscription_status: 'CANCELLED',
      subscription_expiry_time: '2024-03-01T00:00:00Z',
      customer_details: { customer_email: 'user@example.com' },
      plan_details: {
        plan_id: 'plan-002',
        plan_recurring_amount: 50,
        plan_currency: 'INR',
        plan_interval_type: 'MONTH',
      },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a paused subscription', () => {
    const raw: RawCashfreeSubscription = {
      subscription_id: 'sub-003',
      subscription_status: 'PAUSED',
      customer_details: { customer_phone: '+919876543210' },
      plan_details: {
        plan_id: 'plan-003',
        plan_recurring_amount: 25,
        plan_currency: 'INR',
      },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
