import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawBluesnapSubscription,
} from '../../../../../../../src/verticals/payments/adapters/bluesnap/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('bluesnap transformSubscription', () => {
  it('maps an ACTIVE subscription with planId to a canonical subscription', () => {
    const raw: RawBluesnapSubscription = {
      subscriptionId: 'SUB-001',
      planId: 'PLAN-001',
      vaultedShopperId: 'SHOPPER-001',
      status: 'ACTIVE',
      recurringChargeAmount: 9.99,
      currency: 'USD',
      quantity: 1,
      autoRenew: true,
      nextChargeDate: '2024-04-01',
      chargeFrequency: 'MONTHLY',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('SUB-001')
    expect(result.externalId).toBe('SUB-001')
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('SHOPPER-001')
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('bluesnap')
    // items array should have one entry for the plan
    expect(result.items).toHaveLength(1)
    expect(result.items[0].priceId).toBe('PLAN-001')
    expect(result.items[0].quantity).toBe(1)
    // 9.99 → 999 cents
    expect(result.items[0].amount).toBe(999)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED subscription to status "cancelled"', () => {
    const raw: RawBluesnapSubscription = {
      subscriptionId: 'SUB-002',
      vaultedShopperId: 'SHOPPER-002',
      status: 'CANCELED',
      currency: 'EUR',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a SUSPENDED subscription to status "past_due"', () => {
    const raw: RawBluesnapSubscription = {
      subscriptionId: 'SUB-003',
      vaultedShopperId: 'SHOPPER-003',
      status: 'SUSPENDED',
      currency: 'USD',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('sets cancelAtPeriodEnd to true when autoRenew is false', () => {
    const raw: RawBluesnapSubscription = {
      subscriptionId: 'SUB-004',
      vaultedShopperId: 'SHOPPER-004',
      status: 'ACTIVE',
      currency: 'USD',
      autoRenew: false,
    }
    const result = transformSubscription(raw)
    expect(result.cancelAtPeriodEnd).toBe(true)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps nextChargeDate to currentPeriodEnd', () => {
    const raw: RawBluesnapSubscription = {
      subscriptionId: 'SUB-005',
      vaultedShopperId: 'SHOPPER-005',
      status: 'ACTIVE',
      currency: 'USD',
      nextChargeDate: '2024-04-01',
    }
    const result = transformSubscription(raw)
    // toIsoDatetime should parse the YYYY-MM-DD date
    expect(result.currentPeriodEnd).toBeDefined()
    expect(typeof result.currentPeriodEnd).toBe('string')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('carries chargeFrequency into metadata', () => {
    const raw: RawBluesnapSubscription = {
      subscriptionId: 'SUB-006',
      vaultedShopperId: 'SHOPPER-006',
      status: 'ACTIVE',
      currency: 'USD',
      chargeFrequency: 'MONTHLY',
    }
    const result = transformSubscription(raw)
    expect(result.metadata['chargeFrequency']).toBe('MONTHLY')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
