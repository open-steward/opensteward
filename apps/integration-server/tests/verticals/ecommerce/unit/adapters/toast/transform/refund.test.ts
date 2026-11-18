/**
 * The refund on a Toast Orders API Payment → Refund.
 *
 * The fixture is the documented example of a fully refunded payment from
 * GET /orders/v2/payments/{guid}
 * (https://doc.toasttab.com/doc/devguide/apiPaymentntInformation.html), with
 * `orderGuid` ("The Toast platform identifier for the order that contains the
 * payment.") added from the `Payment` schema, since the example omits it.
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/toast/transform/refund'
import type { RawToastPayment } from '../../../../../../../src/verticals/ecommerce/adapters/toast/transform/transaction'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function refundedPayment(overrides: Partial<RawToastPayment> = {}): RawToastPayment {
  return {
    guid: '3e95fde2-da0f-4057-b91c-840b43e637c5',
    entityType: 'OrderPayment',
    externalId: null,
    amount: 6.36,
    tipAmount: 0.0,
    amountTendered: 6.36,
    cardType: 'VISA',
    refundStatus: 'FULL',
    type: 'CREDIT',
    voidInfo: null,
    paidDate: '2020-02-19T19:47:51.206+0000',
    cardEntryMode: 'ONLINE',
    paymentStatus: 'CAPTURED',
    paidBusinessDate: 20200219,
    last4Digits: '1111',
    refund: {
      refundAmount: 6.36,
      tipRefundAmount: 0.0,
      refundDate: '2020-02-19T19:48:31.828+0000',
      refundBusinessDate: 20200219,
    },
    orderGuid: 'ord-guid-1',
    ...overrides,
  }
}

describe('transformRefund (Toast)', () => {
  it('maps the documented refunded payment and parses as a Refund', () => {
    const raw = refundedPayment()
    const result = RefundSchema.parse(transformRefund(raw, 'USD'))
    expect(result.id).toBe('3e95fde2-da0f-4057-b91c-840b43e637c5')
    expect(result.orderId).toBe('ord-guid-1')
    expect(result.amount).toEqual({ amount: 636, currency: 'USD' })
    expect(result.transactionIds).toEqual(['3e95fde2-da0f-4057-b91c-840b43e637c5'])
    expect(result.processedAt).toBe('2020-02-19T19:48:31.828Z')
    expect(result.metadata).toEqual(raw)
  })

  it('adds the tip refund to the refund amount', () => {
    const raw = refundedPayment({ refund: { refundAmount: 10, tipRefundAmount: 1.5 } })
    expect(transformRefund(raw, 'USD').amount).toEqual({ amount: 1150, currency: 'USD' })
  })

  it('omits the amount when the currency or refundAmount is unknown', () => {
    expect(RefundSchema.parse(transformRefund(refundedPayment(), undefined)).amount).toBeUndefined()
    const noAmount = refundedPayment({ refund: { tipRefundAmount: 1 } })
    expect(transformRefund(noAmount, 'USD').amount).toBeUndefined()
  })

  it('throws on a payment with no refund, or no orderGuid', () => {
    expect(() => transformRefund(refundedPayment({ refund: null }), 'USD')).toThrow(/no refund/)
    expect(() => transformRefund(refundedPayment({ orderGuid: undefined }), 'USD')).toThrow(
      /no orderGuid/,
    )
  })

  it('untransformRefund keeps the payment and order ids', () => {
    const body = untransformRefund(transformRefund(refundedPayment(), 'USD'))
    expect(body['paymentGuid']).toBe('3e95fde2-da0f-4057-b91c-840b43e637c5')
    expect(body['orderGuid']).toBe('ord-guid-1')
  })
})
