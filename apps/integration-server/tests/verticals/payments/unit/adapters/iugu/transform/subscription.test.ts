import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawIuguSubscription,
} from '../../../../../../../src/verticals/payments/adapters/iugu/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('iugu transformSubscription', () => {
  it('maps an active subscription with plan and recent invoices', () => {
    const raw: RawIuguSubscription = {
      id: 'sub-001',
      customer_id: 'cust-001',
      status: 'active',
      currency: 'BRL',
      plan_identifier: 'basic_monthly',
      price_cents: 9900,
      current_period_start: '2024-03-01T00:00:00Z',
      current_period_end: '2024-04-01T00:00:00Z',
      recent_invoices: [{ id: 'inv-001' }, { id: 'inv-002' }],
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('sub-001')
    expect(result.customerId).toBe('cust-001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('BRL')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].priceId).toBe('basic_monthly')
    expect(result.items[0].amount).toBe(9900)
    expect(result.latestInvoiceId).toBe('inv-001')
    expect(result.gateway).toBe('iugu')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled subscription', () => {
    const raw: RawIuguSubscription = {
      id: 'sub-002',
      customer_id: 'cust-002',
      status: 'cancelled',
      currency: 'BRL',
      canceled_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBe('2024-03-01T00:00:00Z')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "suspended" to "past_due"', () => {
    const raw: RawIuguSubscription = {
      id: 'sub-003',
      customer_id: 'cust-003',
      status: 'suspended',
      currency: 'BRL',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('past_due')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "expired" to "expired"', () => {
    const raw: RawIuguSubscription = {
      id: 'sub-004',
      customer_id: 'cust-004',
      status: 'expired',
      currency: 'BRL',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps "trialing" to "trialing"', () => {
    const raw: RawIuguSubscription = {
      id: 'sub-005',
      customer_id: 'cust-005',
      status: 'trialing',
      currency: 'BRL',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('trialing')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('returns empty items array when plan_identifier is absent', () => {
    const raw: RawIuguSubscription = {
      id: 'sub-006',
      customer_id: 'cust-006',
      status: 'active',
    }
    const result = transformSubscription(raw)
    expect(result.items).toEqual([])
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
