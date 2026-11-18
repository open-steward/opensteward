import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawMidtransRefundLine,
} from '../../../../../../../src/verticals/payments/adapters/midtrans/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('midtrans transformRefund', () => {
  it('maps a refund line with status_code 200 to "succeeded"', () => {
    const line: RawMidtransRefundLine = {
      refund_chargeback_id: 'refund-001',
      refund_amount: '5000.00',
      refund_key: 'refund-key-001',
      reason: 'customer request',
      refund_method: 'online',
      created_at: '2024-03-01 10:00:00',
    }
    const result = transformRefund(line, 'order-001', 'IDR', '200')
    expect(result.id).toBe('refund-001')
    expect(result.chargeId).toBe('order-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(500000)
    expect(result.currency).toBe('IDR')
    expect(result.gateway).toBe('midtrans')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a refund line with status_code 202 to "pending"', () => {
    const line: RawMidtransRefundLine = {
      refund_chargeback_id: 'refund-002',
      refund_amount: '3000.00',
      created_at: '2024-03-01 10:00:00',
    }
    const result = transformRefund(line, 'order-002', 'IDR', '202')
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to "succeeded" when status_code is undefined', () => {
    const line: RawMidtransRefundLine = {
      refund_chargeback_id: 'refund-003',
      refund_amount: '1000.00',
    }
    const result = transformRefund(line, 'order-003', 'IDR', undefined)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
