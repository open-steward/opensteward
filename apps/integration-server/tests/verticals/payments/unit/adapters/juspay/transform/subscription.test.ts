import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawJuspayMandate,
} from '../../../../../../../src/verticals/payments/adapters/juspay/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('juspay transformSubscription', () => {
  it('maps mandate status ACTIVE to "active" with Unix timestamp dates', () => {
    const raw: RawJuspayMandate = {
      mandate_id: 'mand-001',
      customer_id: 'cust-001',
      status: 'ACTIVE',
      max_amount: 1000,
      currency: 'INR',
      start_date: 1709251200, // 2024-03-01 00:00:00 UTC
      end_date: 1740787200, // 2025-03-01 00:00:00 UTC
      activated_at: '2024-03-01T00:00:00Z',
      frequency: 'MONTHLY',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('active')
    expect(result.id).toBe('mand-001')
    expect(result.customerId).toBe('cust-001')
    expect(result.currency).toBe('INR')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].amount).toBe(100000)
    expect(result.gateway).toBe('juspay')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status REVOKED to "cancelled" and sets cancelledAt', () => {
    const raw: RawJuspayMandate = {
      mandate_id: 'mand-002',
      customer_id: 'cust-002',
      status: 'REVOKED',
      activated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeDefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status PAUSED to "paused"', () => {
    const raw: RawJuspayMandate = {
      mandate_id: 'mand-003',
      customer_id: 'cust-003',
      status: 'PAUSED',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps status EXPIRED to "expired"', () => {
    const raw: RawJuspayMandate = {
      mandate_id: 'mand-004',
      customer_id: 'cust-004',
      status: 'EXPIRED',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('expired')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
