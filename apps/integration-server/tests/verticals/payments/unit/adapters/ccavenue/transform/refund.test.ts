import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawCcavenueRefund,
  type RefundContext,
} from '../../../../../../../src/verticals/payments/adapters/ccavenue/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('ccavenue transformRefund', () => {
  it('maps a successful refund (refund_status "0")', () => {
    const raw: RawCcavenueRefund = {
      refund_status: 0,
      reference_no: 'REF-001',
    }
    const context: RefundContext = {
      chargeId: 'REF-001',
      amount: 149950,
      currency: 'INR',
      refundRefNo: 'RFND-REF-001',
    }
    const result = transformRefund(raw, context)
    expect(result.id).toBe('RFND-REF-001')
    expect(result.chargeId).toBe('REF-001')
    expect(result.amount).toBe(149950)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('ccavenue')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund (refund_status "1")', () => {
    const raw: RawCcavenueRefund = {
      refund_status: 1,
      reason: 'Insufficient balance',
      error_code: 'INSUF_BAL',
      reference_no: 'REF-002',
    }
    const context: RefundContext = {
      chargeId: 'REF-002',
      amount: 50000,
      currency: 'INR',
    }
    const result = transformRefund(raw, context)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Insufficient balance')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund (unknown refund_status)', () => {
    const raw: RawCcavenueRefund = {
      refund_status: 99,
      reference_no: 'REF-003',
    }
    const context: RefundContext = {
      chargeId: 'REF-003',
      amount: 10000,
      currency: 'USD',
    }
    const result = transformRefund(raw, context)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to INR when context.currency is absent', () => {
    const raw: RawCcavenueRefund = {
      refund_status: 0,
    }
    const context: RefundContext = {
      chargeId: 'REF-004',
      amount: 5000,
    }
    const result = transformRefund(raw, context)
    expect(result.currency).toBe('INR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
