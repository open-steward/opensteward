import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawLagoSubscription,
} from '../../../../../../../src/verticals/payments/adapters/lago/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('lago transformSubscription', () => {
  it('maps an active subscription with plan_code and customer ids', () => {
    const raw: RawLagoSubscription = {
      lago_id: 'lago-sub-001',
      external_id: 'ext-sub-001',
      external_customer_id: 'ext-cust-001',
      plan_code: 'pro-monthly',
      status: 'active',
      current_billing_period_started_at: '2024-03-01T00:00:00Z',
      current_billing_period_ending_at: '2024-04-01T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('ext-sub-001')
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('ext-cust-001')
    expect(result.items[0].priceId).toBe('pro-monthly')
    expect(result.gateway).toBe('lago')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a terminated subscription to status "cancelled"', () => {
    const raw: RawLagoSubscription = {
      lago_id: 'lago-sub-002',
      external_id: 'ext-sub-002',
      external_customer_id: 'ext-cust-002',
      plan_code: 'starter-monthly',
      status: 'terminated',
      terminated_at: '2024-03-15T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeTruthy()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a pending subscription to status "incomplete"', () => {
    const raw: RawLagoSubscription = {
      lago_id: 'lago-sub-003',
      external_id: 'ext-sub-003',
      external_customer_id: 'ext-cust-003',
      status: 'pending',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
