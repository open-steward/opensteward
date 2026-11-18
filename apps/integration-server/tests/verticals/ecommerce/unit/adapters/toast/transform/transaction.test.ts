/**
 * Toast Orders API Payment → Transaction.
 *
 * Fixtures are the documented example responses of
 * GET /orders/v2/payments/{guid}
 * (https://doc.toasttab.com/doc/devguide/apiPaymentntInformation.html).
 */
import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawToastPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/toast/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

/** First documented example: a captured credit payment. */
function captured(): RawToastPayment {
  return {
    guid: '361d140a-aa0b-43ad-98d6-516c416555d9',
    entityType: 'OrderPayment',
    externalId: null,
    originalProcessingFee: null,
    amount: 57.73,
    tipAmount: 0,
    amountTendered: 0,
    cashDrawer: null,
    cardType: 'VISA',
    refundStatus: 'NONE',
    type: 'CREDIT',
    voidInfo: null,
    mcaRepaymentAmount: 22.69,
    paidDate: '2020-02-11T16:38:32.774+0000',
    cardEntryMode: 'KEYED',
    paymentStatus: 'CAPTURED',
    paidBusinessDate: 20200211,
    last4Digits: '1111',
    refund: null,
    orderGuid: '86675d88-b27e-4850-94ab-48662563eae8',
    checkGuid: 'ed4b222f-5259-43fd-8db0-1243a11ed554',
  }
}

/** Second documented example: a voided cash payment (no orderGuid in the example). */
function voidedCash(): RawToastPayment {
  return {
    guid: '2f20387c-2b39-4c67-8898-b3faccb3ce06',
    entityType: 'OrderPayment',
    amount: 42.8,
    tipAmount: 0,
    amountTendered: 42.8,
    refundStatus: 'NONE',
    type: 'CASH',
    voidInfo: { voidDate: '2020-02-18T19:24:56.311+0000', voidBusinessDate: 20200218 },
    paidDate: '2020-02-18T18:10:28.187+0000',
    paymentStatus: 'VOIDED',
    paidBusinessDate: 20200218,
    refund: null,
  }
}

describe('transformTransaction (Toast)', () => {
  it('maps the documented captured payment and parses as a Transaction', () => {
    const raw = captured()
    const result = TransactionSchema.parse(transformTransaction(raw, 'USD'))
    expect(result.id).toBe('361d140a-aa0b-43ad-98d6-516c416555d9')
    expect(result.orderId).toBe('86675d88-b27e-4850-94ab-48662563eae8')
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
    expect(result.amount).toEqual({ amount: 5773, currency: 'USD' })
    expect(result.processedAt).toBe('2020-02-11T16:38:32.774Z')
    expect(result.metadata).toEqual(raw)
  })

  it('leaves the status of a voided payment unmapped and invents no gateway or createdAt', () => {
    const result = TransactionSchema.parse(transformTransaction(voidedCash(), 'USD'))
    expect(result.status).toBeUndefined()
    expect(result.orderId).toBeUndefined()
    expect(result.gateway).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.amount).toEqual({ amount: 4280, currency: 'USD' })
  })

  it('maps in-flight, denied and error statuses', () => {
    const at = (paymentStatus: string) =>
      transformTransaction({ ...captured(), paymentStatus }, 'USD').status
    expect(at('AUTHORIZED')).toBe('PENDING')
    expect(at('PROCESSING')).toBe('PENDING')
    expect(at('DENIED')).toBe('FAILURE')
    expect(at('ERROR_NETWORK')).toBe('ERROR')
    expect(at('ERROR')).toBe('ERROR')
  })

  it('takes the amount without the tip ("The amount of this payment, excluding tips.")', () => {
    const result = TransactionSchema.parse(
      transformTransaction({ ...captured(), amount: 20, tipAmount: 3.5 }, 'USD'),
    )
    expect(result.amount).toEqual({ amount: 2000, currency: 'USD' })
  })

  it('omits the amount when the restaurant currency is unknown', () => {
    const result = TransactionSchema.parse(transformTransaction(captured(), undefined))
    expect(result.amount).toBeUndefined()
  })
})
