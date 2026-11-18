import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/moneris/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { PAYMENT_CANCELED, PAYMENT_DECLINED, PAYMENT_SUCCEEDED } from '../fixtures'

describe('moneris transformCharge', () => {
  it('maps a documented payment, amount already in cents', () => {
    const c = ChargeSchema.parse(transformCharge(PAYMENT_SUCCEEDED))
    expect(c.id).toBe('pi0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(c.externalId).toBe('pi0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(c.amount).toBe(16000)
    expect(c.currency).toBe('CAD')
    expect(c.status).toBe('succeeded')
    expect(c.customerId).toBe('ci0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(c.paymentMethodId).toBe('pm0105ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(c.metadata).toEqual({ property1: 'string', property2: 'string' })
    expect(c.createdAt).toBe('2019-07-30T06:43:40.252Z')
    expect(c.updatedAt).toBe('2019-07-30T06:43:40.252Z')
    expect(c.amountRefunded).toBeUndefined()
    expect(c.refundIds).toBeUndefined()
  })

  // `currency`: "Provides the three letter currency code according the ISO 4217 standard." (getpayments.md)
  it('reads the currency from the payment amount, not a default', () => {
    const c = ChargeSchema.parse(
      transformCharge({ ...PAYMENT_SUCCEEDED, amount: { amount: 5000, currency: 'USD' } }),
    )
    expect(c.currency).toBe('USD')
    expect(c.amount).toBe(5000)
  })

  it.each([
    ['CANCELED', 'cancelled'],
    ['DECLINED', 'failed'],
    ['DECLINED_RETRY', 'failed'],
    ['AUTHORIZED', 'pending'],
    ['PROCESSING', 'pending'],
    ['INCREMENTED', 'pending'],
    ['PARTIALLY_COMPLETED', 'succeeded'],
  ] as const)('maps paymentStatus %s to %s', (paymentStatus, status) => {
    expect(
      ChargeSchema.parse(transformCharge({ ...PAYMENT_SUCCEEDED, paymentStatus })).status,
    ).toBe(status)
  })

  it('maps the documented example statuses', () => {
    expect(transformCharge(PAYMENT_CANCELED).status).toBe('cancelled')
    expect(transformCharge(PAYMENT_DECLINED).status).toBe('failed')
  })

  it('reads refundDetails and the subscription reference', () => {
    const c = ChargeSchema.parse(
      transformCharge({
        ...PAYMENT_SUCCEEDED,
        refundDetails: {
          refunds: [{ refundId: 'ri0105ARZ3NDEKTSV4RRFFQ69G5FAV' }],
          refundedAmount: { amount: 1600, currency: 'CAD' },
        },
        subscription: { subscriptionId: 'rp0105ARZ3NDEKTSV4RRFFQ69G5FAV' },
      }),
    )
    expect(c.amountRefunded).toBe(1600)
    expect(c.refundIds).toEqual(['ri0105ARZ3NDEKTSV4RRFFQ69G5FAV'])
    expect(c.subscriptionId).toBe('rp0105ARZ3NDEKTSV4RRFFQ69G5FAV')
  })

  it('throws on a payment without paymentId', () => {
    expect(() => transformCharge({ ...PAYMENT_SUCCEEDED, paymentId: '' })).toThrow(/paymentId/)
  })
})
