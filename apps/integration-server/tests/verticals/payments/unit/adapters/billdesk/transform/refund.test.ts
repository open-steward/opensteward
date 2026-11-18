import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawBilldeskRefund,
} from '../../../../../../../src/verticals/payments/adapters/billdesk/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('billdesk transformRefund', () => {
  it('maps refund_status 0799 (settled refund) to status "succeeded"', () => {
    const raw: RawBilldeskRefund = {
      refundid: 'refund-001',
      transactionid: 'txn-001',
      orderid: 'ord-001',
      mercid: 'MERC001',
      refund_amount: '299.00',
      txn_amount: '299.00',
      currency: '356',
      refund_status: '0799',
      refund_date: '2024-03-01T00:00:00+05:30',
      merc_refund_ref_no: 'MREF-001',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('refund-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(29900)
    expect(result.currency).toBe('INR')
    expect(result.chargeId).toBe('txn-001')
    expect(result.receiptNumber).toBe('MREF-001')
    expect(result.gateway).toBe('billdesk')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps refund_status 0699 (cancellation of unsettled txn) to status "succeeded"', () => {
    const raw: RawBilldeskRefund = {
      refundid: 'refund-002',
      transactionid: 'txn-002',
      refund_amount: '100.00',
      currency: '356',
      refund_status: '0699',
      refund_date: '2024-03-01T00:00:00+05:30',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps unknown refund_status to status "pending"', () => {
    const raw: RawBilldeskRefund = {
      refundid: 'refund-003',
      transactionid: 'txn-003',
      refund_amount: '50.00',
      currency: '356',
      refund_status: '9999',
      refund_date: '2024-03-01T00:00:00+05:30',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to orderid for chargeId when transactionid is absent', () => {
    const raw: RawBilldeskRefund = {
      refundid: 'refund-004',
      orderid: 'ord-004',
      refund_amount: '75.00',
      currency: '356',
      refund_status: '0799',
    }
    const result = transformRefund(raw)
    expect(result.chargeId).toBe('ord-004')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('converts numeric currency code 356 to "INR"', () => {
    const raw: RawBilldeskRefund = {
      refundid: 'refund-005',
      transactionid: 'txn-005',
      refund_amount: '200.00',
      currency: '356',
      refund_status: '0799',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('INR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
