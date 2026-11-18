import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawIntasendSubscription,
} from '../../../../../../../src/verticals/payments/adapters/intasend/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('intasend transformSubscription', () => {
  it('maps an ACTIVE subscription with nested customer', () => {
    const raw: RawIntasendSubscription = {
      subscription_id: 'SUB-001',
      customer: {
        customer_id: 'cust-abc',
        email: 'jane@example.com',
      },
      plan: {
        plan_id: 'PLAN-001',
        currency: 'KES',
      },
      status: 'ACTIVE',
      start_date: '2024-03-01T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('SUB-001')
    expect(result.customerId).toBe('cust-abc')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('KES')
    expect(result.cancelledAt).toBeUndefined()
    expect(result.gateway).toBe('intasend')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED subscription and sets cancelledAt', () => {
    const raw: RawIntasendSubscription = {
      subscription_id: 'SUB-002',
      customer_id: 'cust-xyz',
      plan: { currency: 'KES' },
      status: 'CANCELED',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING subscription to "incomplete"', () => {
    const raw: RawIntasendSubscription = {
      subscription_id: 'SUB-003',
      customer_id: 'cust-pending',
      status: 'PENDING',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(result.currency).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('falls back to id when subscription_id is absent', () => {
    const raw: RawIntasendSubscription = {
      id: 55,
      customer_id: 'cust-fallback',
      status: 'ACTIVE',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('55')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
