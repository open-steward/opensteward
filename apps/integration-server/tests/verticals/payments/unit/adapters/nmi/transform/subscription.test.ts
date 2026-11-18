import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawNmiSubscription,
} from '../../../../../../../src/verticals/payments/adapters/nmi/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('nmi transformSubscription', () => {
  it('maps an active subscription with monthly plan', () => {
    const raw: RawNmiSubscription = {
      subscriptionId: 'sub-001',
      status: 'active',
      planId: 'plan-001',
      planName: 'Monthly Basic',
      planAmount: '29.99',
      monthFrequency: '1',
      dayOfMonth: '1',
      planPayments: '12',
      completedPayments: '3',
      remainingPayments: '9',
      nextChargeDate: '2024-04-01',
      customerVaultId: 'vault-001',
      currency: 'USD',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-001')
    expect(result.externalId).toBe('sub-001')
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('vault-001')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.amount).toBe(2999)
    expect(result.gateway).toBe('nmi')
    expect(result.metadata['plan_id']).toBe('plan-001')
    expect(result.metadata['completed_payments']).toBe('3')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a stopped subscription to status "cancelled"', () => {
    const raw: RawNmiSubscription = {
      subscriptionId: 'sub-002',
      status: 'stopped',
      planAmount: '9.99',
      currency: 'USD',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps an inactive subscription to status "cancelled"', () => {
    const raw: RawNmiSubscription = {
      subscriptionId: 'sub-003',
      status: 'inactive',
      planAmount: '5.00',
      currency: 'USD',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('produces empty items array when planAmount is zero', () => {
    const raw: RawNmiSubscription = {
      subscriptionId: 'sub-004',
      status: 'active',
      planAmount: '0.00',
      currency: 'USD',
    }
    const result = transformSubscription(raw)
    expect(result.items).toEqual([])
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('parses ISO date nextChargeDate for currentPeriodEnd', () => {
    const raw: RawNmiSubscription = {
      subscriptionId: 'sub-005',
      status: 'active',
      planAmount: '15.00',
      nextChargeDate: '2024-05-01',
      currency: 'USD',
    }
    const result = transformSubscription(raw)
    expect(result.currentPeriodEnd).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
