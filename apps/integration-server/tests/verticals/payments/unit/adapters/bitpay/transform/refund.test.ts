import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawBitpayRefund,
} from '../../../../../../../src/verticals/payments/adapters/bitpay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('bitpay transformRefund', () => {
  it('maps a "success" refund to status "succeeded" with correct amount', () => {
    const raw: RawBitpayRefund = {
      id: 'REFUND-001',
      invoice: 'INVOICE-001',
      status: 'success',
      amount: 49.99,
      currency: 'USD',
      requestDate: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('REFUND-001')
    expect(result.chargeId).toBe('INVOICE-001')
    expect(result.status).toBe('succeeded')
    // 49.99 USD → 4999 cents
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('bitpay')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "canceled" refund to status "cancelled"', () => {
    const raw: RawBitpayRefund = {
      id: 'REFUND-002',
      invoice: 'INVOICE-002',
      status: 'canceled',
      amount: 20.0,
      currency: 'EUR',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "created" refund to status "pending"', () => {
    const raw: RawBitpayRefund = {
      id: 'REFUND-003',
      invoice: 'INVOICE-003',
      status: 'created',
      amount: 10.0,
      currency: 'GBP',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(1000)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "failed" refund to status "failed"', () => {
    const raw: RawBitpayRefund = {
      id: 'REFUND-004',
      invoice: 'INVOICE-004',
      status: 'failed',
      amount: 5.0,
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back id to guid when id is absent', () => {
    const raw: RawBitpayRefund = {
      guid: 'guid-refund-005',
      invoice: 'INVOICE-005',
      status: 'completed',
      amount: 8.0,
      currency: 'USD',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('guid-refund-005')
    expect(result.externalId).toBe('guid-refund-005')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
