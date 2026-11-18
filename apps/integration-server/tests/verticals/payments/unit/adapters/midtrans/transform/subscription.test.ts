import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawMidtransSubscription,
} from '../../../../../../../src/verticals/payments/adapters/midtrans/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('midtrans transformSubscription', () => {
  it('maps an active subscription with amount and customer_details', () => {
    const raw: RawMidtransSubscription = {
      id: 'sub-001',
      name: 'Monthly IDR Plan',
      amount: '150000.00',
      currency: 'IDR',
      status: 'active',
      payment_type: 'credit_card',
      customer_details: {
        id: 'cust-001',
        email: 'user@example.com',
      },
      schedule: {
        interval: 1,
        interval_type: 'month',
        max_interval: 12,
      },
      created_at: '2024-03-01 09:00:00',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-001')
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('cust-001')
    // 150000.00 × 100 = 15000000 minor units
    expect(result.items[0].amount).toBe(15000000)
    expect(result.currency).toBe('IDR')
    expect(result.gateway).toBe('midtrans')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps an inactive subscription to status "cancelled"', () => {
    const raw: RawMidtransSubscription = {
      id: 'sub-002',
      amount: '50000.00',
      currency: 'IDR',
      status: 'inactive',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('returns empty items array when amount is zero', () => {
    const raw: RawMidtransSubscription = {
      id: 'sub-003',
      amount: '0',
      currency: 'IDR',
      status: 'active',
    }
    const result = transformSubscription(raw)
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
