import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  isCharge,
} from '../../../../../../../src/verticals/payments/adapters/killbill/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

// Example Response of "Retrieve a payment [using paymentId]", https://killbill.github.io/slate/payment.html
export const DOC_PAYMENT = {
  accountId: '84c7e0d4-a5ed-405f-a655-3ed16ae19997',
  paymentId: '8fe697d4-2c25-482c-aa45-f6cd5a48186d',
  paymentNumber: '14',
  paymentExternalKey: 'paymentExternalKey',
  authAmount: 1,
  capturedAmount: 6,
  purchasedAmount: 0,
  refundedAmount: 0,
  creditedAmount: 0,
  currency: 'USD',
  paymentMethodId: '916619a4-02bb-4d3d-b3da-2584ac897b19',
  transactions: [
    {
      transactionId: '208d38df-8d5a-4e20-89df-15db4b3516b4',
      transactionExternalKey: '208d38df-8d5a-4e20-89df-15db4b3516b4',
      paymentId: '8fe697d4-2c25-482c-aa45-f6cd5a48186d',
      paymentExternalKey: 'paymentExternalKey',
      transactionType: 'AUTHORIZE',
      amount: 1,
      currency: 'USD',
      effectiveDate: '2018-07-19T16:39:00.000Z',
      processedAmount: 1,
      processedCurrency: 'USD',
      status: 'SUCCESS',
      gatewayErrorCode: null,
      gatewayErrorMsg: null,
      firstPaymentReferenceId: null,
      secondPaymentReferenceId: null,
      properties: null,
      auditLogs: [],
    },
  ],
  paymentAttempts: null,
  auditLogs: [],
}

describe('killbill transformCharge', () => {
  it('maps the documented payment example', () => {
    const c = ChargeSchema.parse(transformCharge(DOC_PAYMENT))
    expect(c.id).toBe('8fe697d4-2c25-482c-aa45-f6cd5a48186d')
    expect(c.amount).toBe(100)
    expect(c.amountCaptured).toBe(600)
    expect(c.amountRefunded).toBe(0)
    expect(c.currency).toBe('USD')
    expect(c.status).toBe('succeeded')
    expect(c.customerId).toBe('84c7e0d4-a5ed-405f-a655-3ed16ae19997')
    expect(c.paymentMethodId).toBe('916619a4-02bb-4d3d-b3da-2584ac897b19')
    expect(c.createdAt).toBe('2018-07-19T16:39:00.000Z')
  })

  it('maps the documented PLUGIN_FAILURE purchase (Get payments example) to failed with the gateway error', () => {
    const raw = {
      ...DOC_PAYMENT,
      transactions: [
        {
          transactionId: '92935e84-fd79-4672-98bf-df84566153c6',
          paymentId: '4634b2ae-5263-4139-99b2-e2005f09a9fd',
          transactionType: 'PURCHASE',
          amount: 1,
          currency: 'USD',
          effectiveDate: '2018-07-18T15:04:05.000Z',
          status: 'PLUGIN_FAILURE',
          gatewayErrorCode: 'RuntimeError',
          gatewayErrorMsg: 'Could not retrieve the payer info: the token is missing',
        },
      ],
    }
    const c = ChargeSchema.parse(transformCharge(raw))
    expect(c.status).toBe('failed')
    expect(c.failureCode).toBe('RuntimeError')
    expect(c.failureMessage).toBe('Could not retrieve the payer info: the token is missing')
    expect(c.amountCaptured).toBe(0)
  })

  it('reports refunds from refundedAmount and REFUND transactions', () => {
    const raw = {
      ...DOC_PAYMENT,
      refundedAmount: 1,
      transactions: [
        ...DOC_PAYMENT.transactions,
        { ...DOC_PAYMENT.transactions[0]!, transactionId: 'r-1', transactionType: 'REFUND' },
      ],
    }
    const c = ChargeSchema.parse(transformCharge(raw))
    expect(c.status).toBe('refunded')
    expect(c.refundIds).toEqual(['r-1'])
  })

  it('maps a successful VOID to cancelled and PENDING / UNKNOWN as documented', () => {
    const tx = DOC_PAYMENT.transactions[0]!
    const voided = {
      ...DOC_PAYMENT,
      transactions: [tx, { ...tx, transactionId: 'v', transactionType: 'VOID' }],
    }
    expect(transformCharge(voided).status).toBe('cancelled')
    expect(
      transformCharge({ ...DOC_PAYMENT, transactions: [{ ...tx, status: 'PENDING' }] }).status,
    ).toBe('pending')
    expect(
      transformCharge({ ...DOC_PAYMENT, transactions: [{ ...tx, status: 'UNKNOWN' }] }).status,
    ).toBe('unknown')
  })

  it('does not treat a CREDIT payment as a charge, and never invents a currency', () => {
    const tx = DOC_PAYMENT.transactions[0]!
    const credit = { ...DOC_PAYMENT, transactions: [{ ...tx, transactionType: 'CREDIT' }] }
    expect(isCharge(credit)).toBe(false)
    expect(() => transformCharge(credit)).toThrow(/AUTHORIZE or PURCHASE/)
    expect(() => transformCharge({ ...DOC_PAYMENT, currency: null })).toThrow(/currency/)
  })

  it('scales by the currency exponent (JPY has none)', () => {
    const tx = DOC_PAYMENT.transactions[0]!
    const jpy = {
      ...DOC_PAYMENT,
      currency: 'JPY',
      transactions: [{ ...tx, amount: 500, currency: 'JPY' }],
    }
    expect(transformCharge(jpy).amount).toBe(500)
  })
})
