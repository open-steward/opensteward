import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawNexiRefund,
} from '../../../../../../../src/verticals/payments/adapters/nexi/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('nexi transformRefund', () => {
  it('maps a Completed refund to status "succeeded"', () => {
    const raw: RawNexiRefund = {
      refundId: 'ref-001',
      chargeId: 'charge-001',
      paymentId: 'pay-001',
      amount: { amount: 5000, currency: 'EUR' },
      state: 'completed',
      created: '2024-03-01T00:00:00Z',
      lastUpdated: '2024-03-01T00:00:00Z',
      invoiceDetails: { invoiceNumber: 'INV-42' },
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-001')
    expect(result.externalId).toBe('ref-001')
    expect(result.chargeId).toBe('charge-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('EUR')
    expect(result.receiptNumber).toBe('INV-42')
    expect(result.gateway).toBe('nexi')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a Pending refund to status "pending"', () => {
    const raw: RawNexiRefund = {
      refundId: 'ref-002',
      paymentId: 'pay-002',
      amount: { amount: 2000, currency: 'DKK' },
      state: 'pending',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.chargeId).toBe('pay-002')
    expect(result.currency).toBe('DKK')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a Failed refund to status "failed"', () => {
    const raw: RawNexiRefund = {
      refundId: 'ref-003',
      chargeId: 'charge-003',
      amount: { amount: 1000, currency: 'EUR' },
      state: 'failed',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a Cancelled refund to status "cancelled"', () => {
    const raw: RawNexiRefund = {
      refundId: 'ref-004',
      chargeId: 'charge-004',
      amount: { amount: 300, currency: 'EUR' },
      state: 'cancelled',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to EUR when amount.currency is absent', () => {
    const raw: RawNexiRefund = {
      refundId: 'ref-005',
      chargeId: 'charge-005',
      amount: { amount: 750 },
      state: 'completed',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('EUR')
    expect(result.amount).toBe(750)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
