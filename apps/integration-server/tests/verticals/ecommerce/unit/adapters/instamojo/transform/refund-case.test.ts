import { describe, it, expect } from 'vitest'
import {
  refundCasePaymentId,
  transformRefundCase,
} from '../../../../../../../src/verticals/ecommerce/adapters/instamojo/transform/refund-case'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'
import { documentedPaymentDetail, documentedRefundCase } from '../fixtures'

describe('transformRefundCase (instamojo)', () => {
  it('maps the documented examples to a schema-valid Refund', () => {
    const raw = documentedRefundCase()
    const result = RefundSchema.parse(transformRefundCase(raw, documentedPaymentDetail()))
    expect(result).toEqual({
      id: 'C5c0751272',
      // the payment request id: orders are Payment Requests in this adapter
      orderId: 'b318750f06e3491484acef4cb4ff7966',
      // the payment id: transactions are Payments in this adapter
      transactionIds: ['MOJO5a06005J21512197'],
      reason: 'QFL',
      note: "Customer isn't satisfied with the quality",
      createdAt: '2020-10-22T11:57:21.410Z',
      metadata: raw,
    })
  })

  it('never puts the payment id in orderId', () => {
    const result = transformRefundCase(documentedRefundCase(), documentedPaymentDetail())
    expect(result.orderId).not.toBe('MOJO5a06005J21512197')
  })

  it('omits amount: the case documents refund_amount but no currency', () => {
    const result = RefundSchema.parse(
      transformRefundCase(documentedRefundCase(), documentedPaymentDetail()),
    )
    expect(result.amount).toBeUndefined()
  })

  it('reads the payment id from a payment link without a trailing slash', () => {
    const raw = {
      ...documentedRefundCase(),
      payment: 'https://api.instamojo.com/v2/payments/MOJO123',
    }
    expect(refundCasePaymentId(raw)).toBe('MOJO123')
    expect(transformRefundCase(raw, documentedPaymentDetail()).transactionIds).toEqual(['MOJO123'])
  })

  it('reads the payment request id from a link without a trailing slash', () => {
    const payment = {
      ...documentedPaymentDetail(),
      payment_request: 'https://api.instamojo.com/v2/payment_requests/abc123',
    }
    expect(transformRefundCase(documentedRefundCase(), payment).orderId).toBe('abc123')
  })

  it('throws when payment is not a v2 payment link', () => {
    const raw = { ...documentedRefundCase(), payment: 'not-a-link' }
    expect(() => refundCasePaymentId(raw)).toThrow(/no v2 payment link/)
    expect(() => transformRefundCase(raw, documentedPaymentDetail())).toThrow(/no v2 payment link/)
  })

  it('rejects a payments link outside /v2/', () => {
    const raw = {
      ...documentedRefundCase(),
      payment: 'https://www.instamojo.com/api/1.1/payments/MOJO5a06005J21512197/',
    }
    expect(() => refundCasePaymentId(raw)).toThrow(/no v2 payment link/)
  })

  it('throws rather than inventing an orderId when the payment has no payment request', () => {
    // "Response will be 'null' if payment is not made against a payment request."
    const payment = { ...documentedPaymentDetail(), payment_request: null }
    expect(() => transformRefundCase(documentedRefundCase(), payment)).toThrow(
      /not made against a payment request/,
    )
  })

  it('rejects a payment_request link outside /v2/', () => {
    const payment = {
      ...documentedPaymentDetail(),
      payment_request: 'https://api.instamojo.com/v1/payment_requests/abc/',
    }
    expect(() => transformRefundCase(documentedRefundCase(), payment)).toThrow(
      /not made against a payment request/,
    )
  })

  it('leaves reason, note and createdAt unset when the case has none', () => {
    const raw = { ...documentedRefundCase(), type: null, body: null, created_at: null }
    const result = RefundSchema.parse(transformRefundCase(raw, documentedPaymentDetail()))
    expect(result.reason).toBeUndefined()
    expect(result.note).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })

  it('reads note from body only, never from type', () => {
    const raw = { ...documentedRefundCase(), body: null }
    const result = transformRefundCase(raw, documentedPaymentDetail())
    expect(result.reason).toBe('QFL')
    expect(result.note).toBeUndefined()
  })

  it('reads reason from type only, never from body', () => {
    const raw = { ...documentedRefundCase(), type: null }
    const result = transformRefundCase(raw, documentedPaymentDetail())
    expect(result.reason).toBeUndefined()
    expect(result.note).toBe("Customer isn't satisfied with the quality")
  })
})
