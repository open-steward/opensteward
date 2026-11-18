import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawRazorpayRefund,
} from '../../../../../../../src/verticals/payments/adapters/razorpay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('razorpay transformRefund', () => {
  it('maps a processed refund with chargeId and upper-cased currency', () => {
    const raw: RawRazorpayRefund = {
      id: 'rfnd_1',
      payment_id: 'pay_99',
      amount: 1500,
      currency: 'inr',
      status: 'processed',
      speed_requested: 'normal',
      speed_processed: 'normal',
      notes: { reason: 'customer request' },
      receipt: 'RCPT001',
      created_at: 1_700_000_000,
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('rfnd_1')
    expect(result.chargeId).toBe('pay_99')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('succeeded')
    expect(result.receiptNumber).toBe('RCPT001')
    expect(result.gateway).toBe('razorpay')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund status', () => {
    const raw: RawRazorpayRefund = {
      id: 'rfnd_2',
      payment_id: 'pay_100',
      amount: 500,
      currency: 'INR',
      status: 'pending',
      created_at: 1_700_000_000,
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund status', () => {
    const raw: RawRazorpayRefund = {
      id: 'rfnd_3',
      payment_id: 'pay_101',
      amount: 750,
      currency: 'INR',
      status: 'failed',
      created_at: 1_700_000_000,
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
