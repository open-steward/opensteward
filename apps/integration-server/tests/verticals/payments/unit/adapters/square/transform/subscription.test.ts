import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawSquareSubscription,
} from '../../../../../../../src/verticals/payments/adapters/square/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('square transformSubscription', () => {
  it('maps an ACTIVE subscription', () => {
    const raw: RawSquareSubscription = {
      id: 'SQ-SUB-001',
      customer_id: 'CUST-001',
      plan_variation_id: 'PLAN-VAR-001',
      status: 'ACTIVE',
      charged_through_date: '2024-07-01T00:00:00Z',
      start_date: '2024-01-01T00:00:00Z',
      price_override_money: { amount: 999, currency: 'USD' },
      card_id: 'CARD-001',
      created_at: '2024-01-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('SQ-SUB-001')
    expect(result.status).toBe('active')
    expect(result.customerId).toBe('CUST-001')
    expect(result.currency).toBe('USD')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.priceId).toBe('PLAN-VAR-001')
    expect(result.currentPeriodEnd).toBe('2024-07-01T00:00:00Z')
    expect(result.defaultPaymentMethodId).toBe('CARD-001')
    expect(result.gateway).toBe('square')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED subscription', () => {
    const raw: RawSquareSubscription = {
      id: 'SQ-SUB-002',
      customer_id: 'CUST-002',
      status: 'CANCELED',
      canceled_date: '2024-05-01T00:00:00Z',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelAt).toBe('2024-05-01T00:00:00Z')
    expect(result.items).toHaveLength(0)
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a PAUSED subscription', () => {
    const raw: RawSquareSubscription = {
      id: 'SQ-SUB-003',
      customer_id: 'CUST-003',
      status: 'PAUSED',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('uses last invoice_id as latestInvoiceId', () => {
    const raw: RawSquareSubscription = {
      id: 'SQ-SUB-004',
      customer_id: 'CUST-004',
      status: 'ACTIVE',
      invoice_ids: ['INV-001', 'INV-002', 'INV-003'],
    }
    const result = transformSubscription(raw)
    expect(result.latestInvoiceId).toBe('INV-003')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
