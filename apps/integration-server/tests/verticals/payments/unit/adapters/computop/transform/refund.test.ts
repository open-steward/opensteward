import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawComputopRefund,
} from '../../../../../../../src/verticals/payments/adapters/computop/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('computop transformRefund', () => {
  it('maps an "OK" refund to status "succeeded"', () => {
    const raw: RawComputopRefund = {
      payId: 'pay-001',
      xId: 'ref-001',
      status: 'OK',
      amount: { value: 2500, currency: 'EUR' },
      createdAt: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ref-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('EUR')
    expect(result.chargeId).toBe('pay-001')
    expect(result.gateway).toBe('computop')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "REFUNDED" to status "succeeded"', () => {
    const raw: RawComputopRefund = {
      payId: 'pay-002',
      xId: 'ref-002',
      status: 'REFUNDED',
      amount: { value: 1000, currency: 'USD' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "FAILED" to status "failed" with failureReason', () => {
    const raw: RawComputopRefund = {
      payId: 'pay-003',
      xId: 'ref-003',
      status: 'FAILED',
      responseCode: '0099',
      responseDescription: 'Refund declined',
      amount: { value: 500, currency: 'EUR' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Refund declined')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses explicit chargeId argument when provided, overriding payId', () => {
    const raw: RawComputopRefund = {
      payId: 'pay-004',
      xId: 'ref-004',
      status: 'OK',
      amount: { value: 300, currency: 'EUR' },
    }
    const result = transformRefund(raw, 'explicit-charge-id')
    expect(result.chargeId).toBe('explicit-charge-id')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "CANCELLED" to status "cancelled"', () => {
    const raw: RawComputopRefund = {
      payId: 'pay-005',
      xId: 'ref-005',
      status: 'CANCELLED',
      amount: { value: 100, currency: 'USD' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
