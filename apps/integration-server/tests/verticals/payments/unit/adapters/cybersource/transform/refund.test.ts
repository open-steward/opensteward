import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawCybersourceRefund,
} from '../../../../../../../src/verticals/payments/adapters/cybersource/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('cybersource transformRefund', () => {
  it('maps a completed refund to succeeded status', () => {
    const raw: RawCybersourceRefund = {
      id: 'ref_1',
      status: 'COMPLETED',
      submitTimeUtc: '2023-11-14T10:00:00Z',
      paymentId: 'pay_abc',
      refundAmountDetails: { refundAmount: '25.00', currency: 'USD' },
      clientReferenceInformation: { code: 'order-42' },
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('ref_1')
    expect(result.chargeId).toBe('pay_abc')
    expect(result.amount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('cybersource')
    expect(result.metadata.clientReferenceCode).toBe('order-42')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING refund to pending status', () => {
    const raw: RawCybersourceRefund = {
      id: 'ref_2',
      status: 'PENDING',
      paymentId: 'pay_xyz',
      refundAmountDetails: { refundAmount: '10.00', currency: 'EUR' },
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('pending')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when absent', () => {
    const raw: RawCybersourceRefund = {
      id: 'ref_3',
      status: 'COMPLETED',
      refundAmountDetails: { refundAmount: '5.50' },
    }
    const result = transformRefund(raw)

    expect(result.currency).toBe('USD')
    expect(result.amount).toBe(550)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
