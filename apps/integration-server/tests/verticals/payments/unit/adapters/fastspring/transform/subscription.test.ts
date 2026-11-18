import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawFastspringSubscription,
} from '../../../../../../../src/verticals/payments/adapters/fastspring/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('fastspring transformSubscription', () => {
  it('maps an active subscription with state "active"', () => {
    const raw: RawFastspringSubscription = {
      id: 'SUB-001',
      subscription: 'SUB-001',
      active: true,
      state: 'active',
      currency: 'usd',
      account: { id: 'ACCT-001', account: 'ACCT-001' },
      product: 'my-product',
      sku: 'SKU-001',
      display: 'My Product',
      quantity: 1,
      price: 49.99,
      autoRenew: true,
      begin: 1709251200000,
      next: 1711929600000,
      changed: 1709251200000,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('ACCT-001')
    expect(result.gateway).toBe('fastspring')
    expect(result.id).toBe('SUB-001')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].productId).toBe('my-product')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps state "trial" to status "trialing"', () => {
    const raw: RawFastspringSubscription = {
      id: 'SUB-002',
      active: true,
      state: 'trial',
      currency: 'USD',
      account: { id: 'ACCT-002' },
      begin: 1709251200000,
      changed: 1709251200000,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('trialing')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps state "overdue" to status "past_due"', () => {
    const raw: RawFastspringSubscription = {
      id: 'SUB-003',
      active: false,
      state: 'overdue',
      currency: 'USD',
      account: 'ACCT-003',
      begin: 1709251200000,
      changed: 1709251200000,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(result.customerId).toBe('ACCT-003')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps state "canceled" to status "cancelled"', () => {
    const raw: RawFastspringSubscription = {
      id: 'SUB-004',
      active: false,
      state: 'canceled',
      currency: 'USD',
      account: { id: 'ACCT-004' },
      canceledDate: 1709251200000,
      begin: 1709251200000,
      changed: 1709251200000,
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps cancelAtPeriodEnd = true when autoRenew is false', () => {
    const raw: RawFastspringSubscription = {
      id: 'SUB-005',
      active: true,
      state: 'active',
      currency: 'USD',
      account: { id: 'ACCT-005' },
      autoRenew: false,
      begin: 1709251200000,
      changed: 1709251200000,
    }
    const result = transformSubscription(raw)
    expect(result.cancelAtPeriodEnd).toBe(true)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
