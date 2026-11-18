import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawGeideaSubscription,
} from '../../../../../../../src/verticals/payments/adapters/geidea/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('geidea transformSubscription', () => {
  it('maps an active subscription with monthly interval', () => {
    const raw: RawGeideaSubscription = {
      subscriptionId: 'sub-001',
      status: 'Active',
      customerId: 'cust-001',
      recurringPaymentAmount: 29.99,
      currency: 'EGP',
      cycleInterval: 'month',
      cycleFrequency: 1,
      startDate: '2024-03-01T00:00:00Z',
      endDate: '2025-03-01T00:00:00Z',
      createdDate: '2024-03-01T00:00:00Z',
      updatedDate: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('cust-001')
    expect(result.items[0].amount).toBe(2999)
    expect(result.currency).toBe('EGP')
    expect(result.gateway).toBe('geidea')
    expect(result.currentPeriodStart).toBeDefined()
    expect(result.currentPeriodEnd).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a Cancelled subscription to status "cancelled"', () => {
    const raw: RawGeideaSubscription = {
      subscriptionId: 'sub-002',
      status: 'Cancelled',
      customerId: 'cust-002',
      recurringPaymentAmount: 9.99,
      currency: 'SAR',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a PastDue subscription to status "past_due"', () => {
    const raw: RawGeideaSubscription = {
      subscriptionId: 'sub-003',
      status: 'PastDue',
      customerId: 'cust-003',
      recurringPaymentAmount: 15.0,
      currency: 'AED',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a Paused subscription to status "paused"', () => {
    const raw: RawGeideaSubscription = {
      subscriptionId: 'sub-004',
      status: 'Paused',
      customerId: 'cust-004',
      recurringPaymentAmount: 5.0,
      currency: 'EGP',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(result.id).toBe('sub-004')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps yearly cycleInterval to interval metadata', () => {
    const raw: RawGeideaSubscription = {
      subscriptionId: 'sub-005',
      status: 'Active',
      customerId: 'cust-005',
      recurringPaymentAmount: 100.0,
      currency: 'EGP',
      cycleInterval: 'Yearly',
    }
    const result = transformSubscription(raw)
    expect(result.metadata.cycleInterval).toBe('Yearly')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
