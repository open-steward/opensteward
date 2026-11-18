import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawKlarnaRefund,
} from '../../../../../../../src/verticals/payments/adapters/klarna/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('klarna transformRefund', () => {
  it('maps a Klarna refund to canonical Refund with correct fields', () => {
    const raw: RawKlarnaRefund = {
      refund_id: 'refund-klarna-001',
      order_id: 'order-klarna-001',
      refunded_amount: 2500,
      refunded_at: '2024-02-10T14:30:00Z',
      currency: 'sek',
      description: 'Customer returned item',
      reference: 'RETURN-001',
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('refund-klarna-001')
    expect(result.externalId).toBe('refund-klarna-001')
    expect(result.chargeId).toBe('order-klarna-001')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('SEK')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('klarna')
    expect(result.metadata.description).toBe('Customer returned item')
    expect(result.metadata.reference).toBe('RETURN-001')
    expect(result.createdAt).toBe('2024-02-10T14:30:00Z')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when not provided', () => {
    const raw: RawKlarnaRefund = {
      refund_id: 'refund-klarna-002',
      order_id: 'order-klarna-002',
      refunded_amount: 1000,
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('EUR')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('throws when refunded_amount is missing (requireAmount guard)', () => {
    const raw: RawKlarnaRefund = {
      refund_id: 'refund-klarna-bad',
    }
    expect(() => transformRefund(raw)).toThrow('klarna refund')
  })

  it('omits metadata keys with null/undefined values', () => {
    const raw: RawKlarnaRefund = {
      refund_id: 'refund-klarna-003',
      order_id: 'order-klarna-003',
      refunded_amount: 500,
      currency: 'EUR',
      description: undefined,
      reference: undefined,
    }
    const result = transformRefund(raw)
    expect(result.metadata).not.toHaveProperty('description')
    expect(result.metadata).not.toHaveProperty('reference')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
