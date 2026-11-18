import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawAdyenRefundResponse,
} from '../../../../../../../src/verticals/payments/adapters/adyen/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('adyen transformRefund', () => {
  it('maps a received refund to status "pending"', () => {
    const raw: RawAdyenRefundResponse = {
      pspReference: 'REF-001',
      paymentPspReference: 'PSP-001',
      merchantReference: 'ORDER-001-refund',
      status: 'received',
      amount: { value: 1500, currency: 'usd' },
      reason: 'Customer requested',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('REF-001')
    expect(result.chargeId).toBe('PSP-001')
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('adyen')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a success refund to status "succeeded"', () => {
    const raw: RawAdyenRefundResponse = {
      pspReference: 'REF-002',
      paymentPspReference: 'PSP-002',
      status: 'success',
      amount: { value: 2000, currency: 'eur' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund to status "failed"', () => {
    const raw: RawAdyenRefundResponse = {
      pspReference: 'REF-003',
      paymentPspReference: 'PSP-003',
      status: 'failed',
      amount: { value: 500, currency: 'gbp' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
