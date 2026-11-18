import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawAsaasSubscription,
} from '../../../../../../../src/verticals/payments/adapters/asaas/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('asaas transformSubscription', () => {
  it('maps an ACTIVE subscription with correct amount and items', () => {
    const raw: RawAsaasSubscription = {
      id: 'sub_001',
      dateCreated: '2024-03-01T00:00:00Z',
      customer: 'cus_001',
      status: 'ACTIVE',
      value: 99.9,
      cycle: 'MONTHLY',
      billingType: 'BOLETO',
      nextDueDate: '2024-04-01T00:00:00Z',
      description: 'Premium plan',
    }
    const result = transformSubscription(raw)

    expect(result.id).toBe('sub_001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('BRL')
    expect(result.customerId).toBe('cus_001')
    expect(result.gateway).toBe('asaas')
    // items array has one synthetic item
    expect(result.items).toHaveLength(1)
    expect(result.items[0].amount).toBe(9990)
    expect(result.items[0].quantity).toBe(1)
    expect(result.metadata?.cycle).toBe('MONTHLY')
    expect(result.metadata?.description).toBe('Premium plan')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps an EXPIRED subscription to expired status', () => {
    const raw: RawAsaasSubscription = {
      id: 'sub_002',
      customer: 'cus_002',
      status: 'EXPIRED',
      value: 29.9,
      cycle: 'YEARLY',
    }
    const result = transformSubscription(raw)

    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps an INACTIVE subscription to paused status', () => {
    const raw: RawAsaasSubscription = {
      id: 'sub_003',
      customer: 'cus_003',
      status: 'INACTIVE',
      value: 10.0,
      cycle: 'MONTHLY',
    }
    const result = transformSubscription(raw)

    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('populates cancelAt from endDate', () => {
    const raw: RawAsaasSubscription = {
      id: 'sub_004',
      customer: 'cus_004',
      status: 'ACTIVE',
      value: 50.0,
      cycle: 'MONTHLY',
      endDate: '2025-01-01T00:00:00Z',
    }
    const result = transformSubscription(raw)

    expect(result.cancelAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('produces a valid subscription with minimal data', () => {
    const raw: RawAsaasSubscription = {
      id: 'sub_005',
      customer: 'cus_005',
    }
    const result = transformSubscription(raw)

    expect(result.id).toBe('sub_005')
    expect(result.status).toBe('active')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
