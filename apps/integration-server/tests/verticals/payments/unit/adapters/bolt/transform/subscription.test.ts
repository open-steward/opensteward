import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawBoltSubscription,
} from '../../../../../../../src/verticals/payments/adapters/bolt/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('bolt transformSubscription', () => {
  it('maps an active subscription with embedded plan', () => {
    const raw: RawBoltSubscription = {
      id: 'sub-001',
      consumer_id: 'consumer-abc',
      subscription_plan_id: 'plan-001',
      status: 'active',
      quantity: 1,
      plan: {
        id: 'plan-001',
        name: 'Monthly Pro',
        product_id: 'prod-001',
        frequency: 1,
        frequency_unit: 'month',
        unit_price: 999,
      },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-001')
    expect(result.customerId).toBe('consumer-abc')
    expect(result.status).toBe('active')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].amount).toBe(999)
    expect(result.gateway).toBe('bolt')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled subscription', () => {
    const raw: RawBoltSubscription = {
      id: 'sub-002',
      consumer_id: 'consumer-xyz',
      status: 'cancelled',
      plan: {
        id: 'plan-002',
        unit_price: 499,
      },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('produces empty items array when plan is absent', () => {
    const raw: RawBoltSubscription = {
      id: 'sub-003',
      consumer_id: 'consumer-xyz',
      status: 'active',
    }
    const result = transformSubscription(raw)
    expect(result.items).toEqual([])
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps paused status', () => {
    const raw: RawBoltSubscription = {
      id: 'sub-004',
      consumer_id: 'consumer-xyz',
      status: 'paused',
      plan: { id: 'plan-003', unit_price: 100 },
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
