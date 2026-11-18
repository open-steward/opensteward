import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawDodoSubscription,
} from '../../../../../../../src/verticals/payments/adapters/dodo-payments/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('dodo-payments transformSubscription', () => {
  it('maps an active subscription with full fields', () => {
    const raw: RawDodoSubscription = {
      subscription_id: 'sub_001',
      product_id: 'prod_001',
      customer: { customer_id: 'cus_001', name: 'Alice', email: 'alice@example.com' },
      status: 'active',
      currency: 'usd',
      recurring_pre_tax_amount: 9999,
      quantity: 1,
      payment_frequency_interval: 'Month',
      payment_frequency_count: 1,
      cancel_at_next_billing_date: false,
      created_at: '2024-03-01T00:00:00Z',
      next_billing_date: '2024-04-01T00:00:00Z',
      previous_billing_date: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub_001')
    expect(result.externalId).toBe('sub_001')
    expect(result.customerId).toBe('cus_001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.collectionMethod).toBe('charge_automatically')
    expect(result.gateway).toBe('dodo-payments')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].productId).toBe('prod_001')
    expect(result.items[0].amount).toBe(9999)
    expect(result.items[0].quantity).toBe(1)
    expect(result.cancelAtPeriodEnd).toBe(false)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "on_hold" to "past_due"', () => {
    const raw: RawDodoSubscription = {
      subscription_id: 'sub_002',
      customer: { customer_id: 'cus_002' },
      status: 'on_hold',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "cancelled" status with cancelled_at', () => {
    const raw: RawDodoSubscription = {
      subscription_id: 'sub_003',
      customer: { customer_id: 'cus_003' },
      status: 'cancelled',
      created_at: '2024-03-01T00:00:00Z',
      cancelled_at: '2024-03-15T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBe('2024-03-15T00:00:00.000Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "failed" and "pending" to "incomplete"', () => {
    const rawFailed: RawDodoSubscription = {
      subscription_id: 'sub_004',
      customer: { customer_id: 'cus_004' },
      status: 'failed',
      created_at: '2024-03-01T00:00:00Z',
    }
    expect(transformSubscription(rawFailed).status).toBe('incomplete')

    const rawPending: RawDodoSubscription = {
      subscription_id: 'sub_005',
      customer: { customer_id: 'cus_005' },
      status: 'pending',
      created_at: '2024-03-01T00:00:00Z',
    }
    expect(transformSubscription(rawPending).status).toBe('incomplete')
    expect(() => SubscriptionSchema.parse(transformSubscription(rawPending))).not.toThrow()
  })
})
