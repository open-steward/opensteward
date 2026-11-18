import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  refundsOf,
} from '../../../../../../../src/verticals/payments/adapters/killbill/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

// NOT a documented example: the docs show no REFUND transaction. This is the
// PaymentTransaction field set (https://killbill.github.io/slate/payment-transaction.html)
// with transactionType set to REFUND, as payment.html describes a refund:
// "A new PaymentTransaction of type REFUND is created."
const DOC_REFUND_TX = {
  transactionId: '07655b3c-7f17-4172-b193-ece48e5741ad',
  transactionExternalKey: '07655b3c-7f17-4172-b193-ece48e5741ad',
  paymentId: 'e8edd4c6-2f85-4375-95f3-e78ca4d85b82',
  paymentExternalKey: 'e8edd4c6-2f85-4375-95f3-e78ca4d85b82',
  transactionType: 'REFUND',
  amount: 2.5,
  currency: 'USD',
  effectiveDate: '2018-07-18T18:58:11.000Z',
  processedAmount: 2.5,
  processedCurrency: 'USD',
  status: 'SUCCESS',
  gatewayErrorCode: null,
  gatewayErrorMsg: null,
  firstPaymentReferenceId: null,
  secondPaymentReferenceId: null,
  properties: null,
  auditLogs: [],
}

describe('killbill transformRefund', () => {
  it('maps a REFUND transaction', () => {
    const r = RefundSchema.parse(transformRefund(DOC_REFUND_TX))
    expect(r.id).toBe('07655b3c-7f17-4172-b193-ece48e5741ad')
    expect(r.chargeId).toBe('e8edd4c6-2f85-4375-95f3-e78ca4d85b82')
    expect(r.amount).toBe(250)
    expect(r.currency).toBe('USD')
    expect(r.status).toBe('succeeded')
    expect(r.createdAt).toBe('2018-07-18T18:58:11.000Z')
  })

  it('maps the documented failure statuses and UNKNOWN', () => {
    expect(transformRefund({ ...DOC_REFUND_TX, status: 'PAYMENT_FAILURE' }).status).toBe('failed')
    expect(transformRefund({ ...DOC_REFUND_TX, status: 'PENDING' }).status).toBe('pending')
    expect(transformRefund({ ...DOC_REFUND_TX, status: 'UNKNOWN' }).status).toBe('unknown')
    const failed = RefundSchema.parse(
      transformRefund({ ...DOC_REFUND_TX, status: 'PAYMENT_FAILURE', gatewayErrorMsg: 'Declined' }),
    )
    expect(failed.failureReason).toBe('Declined')
  })

  it('throws instead of inventing an amount or currency', () => {
    expect(() => transformRefund({ ...DOC_REFUND_TX, amount: null })).toThrow(/amount/)
    expect(() => transformRefund({ ...DOC_REFUND_TX, currency: null })).toThrow(/currency/)
  })

  it('refundsOf keeps only REFUND transactions', () => {
    const out = refundsOf({
      paymentId: 'p',
      transactions: [
        { ...DOC_REFUND_TX, transactionType: 'PURCHASE', transactionId: 'x' },
        DOC_REFUND_TX,
      ],
    })
    expect(out.map((r) => r.id)).toEqual(['07655b3c-7f17-4172-b193-ece48e5741ad'])
  })
})
