import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/moneris/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'
import { REFUND_DECLINED, REFUND_SUCCEEDED } from '../fixtures'

describe('moneris transformRefund', () => {
  it('maps a documented refund', () => {
    const r = RefundSchema.parse(transformRefund(REFUND_SUCCEEDED))
    expect(r.id).toBe('ri0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(r.externalId).toBe('ri0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(r.chargeId).toBe('pi0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(r.amount).toBe(1600)
    expect(r.currency).toBe('CAD')
    expect(r.status).toBe('succeeded')
    expect(r.metadata).toEqual({ property1: 'string', property2: 'string' })
    expect(r.createdAt).toBe('2019-07-30T06:43:40.252Z')
    expect(r.updatedAt).toBe('2019-07-30T06:43:40.252Z')
  })

  // `currency`: "Provides the three letter currency code according the ISO 4217 standard." (getpayments.md)
  it('reads the currency from refundAmount, not a default', () => {
    const r = RefundSchema.parse(
      transformRefund({ ...REFUND_SUCCEEDED, refundAmount: { amount: 700, currency: 'USD' } }),
    )
    expect(r.currency).toBe('USD')
    expect(r.amount).toBe(700)
  })

  it.each([
    ['DECLINED', 'failed'],
    ['DECLINED_RETRY', 'failed'],
    ['PROCESSING', 'pending'],
  ] as const)('maps refundStatus %s to %s', (refundStatus, status) => {
    expect(RefundSchema.parse(transformRefund({ ...REFUND_SUCCEEDED, refundStatus })).status).toBe(
      status,
    )
  })

  it('maps the documented declined example', () => {
    expect(RefundSchema.parse(transformRefund(REFUND_DECLINED)).status).toBe('failed')
  })

  it('throws on an independent refund with no payment, rather than invent a charge id', () => {
    expect(() => transformRefund({ ...REFUND_SUCCEEDED, payment: null })).toThrow(/paymentId/)
  })
})
