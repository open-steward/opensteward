import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawPayuRefund,
} from '../../../../../../../src/verticals/payments/adapters/payu/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('payu transformRefund', () => {
  it('maps a FINALIZED refund to succeeded', () => {
    const raw: RawPayuRefund = {
      refundId: 'ref_1',
      extRefundId: 'ext_ref_001',
      amount: '1500',
      currencyCode: 'PLN',
      status: 'FINALIZED',
      statusDateTime: '2023-11-14T10:00:00+01:00',
      reasonDescription: 'Customer request',
      orderId: 'ord_abc',
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('ref_1')
    expect(result.externalId).toBe('ext_ref_001')
    expect(result.chargeId).toBe('ord_abc')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('PLN')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('payu')
    expect(result.metadata.reasonDescription).toBe('Customer request')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps PENDING refund status', () => {
    const raw: RawPayuRefund = {
      refundId: 'ref_2',
      amount: '500',
      currencyCode: 'EUR',
      status: 'PENDING',
      orderId: 'ord_xyz',
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('pending')
    expect(result.chargeId).toBe('ord_xyz')
    expect(result.amount).toBe(500)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELED to cancelled', () => {
    const raw: RawPayuRefund = {
      refundId: 'ref_3',
      amount: '200',
      currencyCode: 'PLN',
      status: 'CANCELED',
      orderId: 'ord_def',
    }
    const result = transformRefund(raw)

    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to extRefundId as id when refundId absent', () => {
    const raw: RawPayuRefund = {
      extRefundId: 'ext_ref_fallback',
      amount: '100',
      currencyCode: 'PLN',
      status: 'FINALIZED',
    }
    const result = transformRefund(raw)

    expect(result.id).toBe('ext_ref_fallback')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('payu untransformRefund', () => {
  it('round-trips: transform → untransform wraps in refund envelope', () => {
    const raw: RawPayuRefund = {
      refundId: 'ref_rt',
      extRefundId: 'ext_ref_rt',
      amount: '2000',
      currencyCode: 'PLN',
      status: 'FINALIZED',
      reasonDescription: 'Defective product',
      orderId: 'ord_rt',
    }
    const canonical = transformRefund(raw)
    const back = untransformRefund(canonical)

    expect(back).toHaveProperty('refund')
    const refundBody = back.refund as Record<string, unknown>
    expect(refundBody.description).toBe('Defective product')
    expect(refundBody.amount).toBe('2000')
  })

  it('omits amount for full refund when amount is 0', () => {
    const back = untransformRefund({ amount: 0 })
    const refundBody = back.refund as Record<string, unknown>
    expect(refundBody.amount).toBeUndefined()
  })
})
