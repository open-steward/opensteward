import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawHelcimSubscription,
} from '../../../../../../../src/verticals/payments/adapters/helcim/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('helcim transformSubscription', () => {
  it('maps an active subscription with recurring amount', () => {
    const raw: RawHelcimSubscription = {
      id: 801,
      customerCode: 'CUST-001',
      paymentPlanId: 301,
      recurringAmount: 29.99,
      status: 'active',
      dateBilling: '2024-04-01 00:00:00',
      dateActivated: '2024-03-01 00:00:00',
      dateCreated: '2024-03-01 00:00:00',
      dateUpdated: '2024-03-01 00:00:00',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('801')
    expect(result.customerId).toBe('CUST-001')
    expect(result.status).toBe('active')
    expect(result.items[0].amount).toBe(2999)
    expect(result.items[0].productId).toBe('301')
    expect(result.currentPeriodEnd).toBeDefined()
    expect(result.billingAnchor).toBeDefined()
    expect(result.gateway).toBe('helcim')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled subscription', () => {
    const raw: RawHelcimSubscription = {
      id: 802,
      customerCode: 'CUST-002',
      recurringAmount: 9.99,
      status: 'cancelled',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps an inactive subscription to status "paused"', () => {
    const raw: RawHelcimSubscription = {
      id: 803,
      customerCode: 'CUST-003',
      recurringAmount: 19.99,
      status: 'inactive',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps an expired subscription', () => {
    const raw: RawHelcimSubscription = {
      id: 804,
      customerCode: 'CUST-004',
      recurringAmount: 49.99,
      status: 'expired',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('produces empty items array when recurringAmount is zero', () => {
    const raw: RawHelcimSubscription = {
      id: 805,
      customerCode: 'CUST-005',
      recurringAmount: 0,
      status: 'active',
    }
    const result = transformSubscription(raw)
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('leaves currency undefined (plan-level concern)', () => {
    const raw: RawHelcimSubscription = {
      id: 806,
      customerCode: 'CUST-006',
      recurringAmount: 5.0,
      status: 'active',
    }
    const result = transformSubscription(raw)
    expect(result.currency).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
