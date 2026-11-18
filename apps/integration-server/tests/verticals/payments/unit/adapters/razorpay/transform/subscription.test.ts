import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawRazorpaySubscription,
} from '../../../../../../../src/verticals/payments/adapters/razorpay/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('razorpay transformSubscription', () => {
  it('maps an active subscription with plan and customer ids', () => {
    const raw: RawRazorpaySubscription = {
      id: 'sub_1',
      customer_id: 'cust_abc',
      plan_id: 'plan_xyz',
      status: 'active',
      current_start: 1_700_000_000,
      current_end: 1_702_592_000,
      start_at: 1_700_000_000,
      paid_count: 3,
      total_count: 12,
      notes: { team: 'eng' },
      created_at: 1_700_000_000,
    }
    const result = transformSubscription(raw)

    expect(result.id).toBe('sub_1')
    expect(result.customerId).toBe('cust_abc')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('INR')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.priceId).toBe('plan_xyz')
    expect(result.gateway).toBe('razorpay')
    expect(result.metadata.paid_count).toBe('3')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps halted status to past_due', () => {
    const raw: RawRazorpaySubscription = {
      id: 'sub_2',
      customer_id: 'cust_def',
      status: 'halted',
      created_at: 1_700_000_000,
    }
    const result = transformSubscription(raw)

    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps cancelled subscription with no plan to empty items', () => {
    const raw: RawRazorpaySubscription = {
      id: 'sub_3',
      customer_id: 'cust_ghi',
      status: 'cancelled',
      created_at: 1_700_000_000,
    }
    const result = transformSubscription(raw)

    expect(result.status).toBe('cancelled')
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
