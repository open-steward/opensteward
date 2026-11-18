/**
 * Fixture: the documented example of GET /object-query/refunds
 * (https://developer.zuora.com/v1-api-reference/api/object-queries/queryrefunds.md,
 * QueryRefundsResponse example in `_bundle/v1-api-reference/api.yaml`), plus the
 * documented `refundApplications.paymentId` of the "refundapplications" expansion.
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawZuoraRefund,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

const DOC_REFUND: RawZuoraRefund = {
  accountId: '8ad09be48db5aba7018db604776d4854',
  amount: 10,
  createdById: 'b243314d594646d3b2651aeedd4be47e',
  createdDate: '2024-07-25T00:19:43-07:00',
  currency: 'USD',
  gateway: 'test gateway',
  gatewayResponse: 'This transaction has been approved by Test gateway.',
  gatewayResponseCode: 'approve',
  gatewayState: 'Submitted',
  id: '8ad0937890e7fca00190e8c290d46fad',
  methodType: 'CreditCard',
  refundDate: '2024-07-25',
  refundNumber: 'R-00000001',
  sourceType: 'Payment',
  status: 'Processed',
  type: 'Electronic',
  updatedDate: '2024-07-25T00:19:43-07:00',
  refundApplications: [
    {
      paymentId: '8ad097b49198384c01919d200fb53143',
      refundId: '8ad0937890e7fca00190e8c290d46fad',
    } as { paymentId: string },
  ],
}

describe('zuora transformRefund', () => {
  it('maps the documented refund example', () => {
    const r = RefundSchema.parse(transformRefund(DOC_REFUND))
    expect(r.id).toBe('8ad0937890e7fca00190e8c290d46fad')
    expect(r.chargeId).toBe('8ad097b49198384c01919d200fb53143')
    expect(r.amount).toBe(1000)
    expect(r.currency).toBe('USD')
    expect(r.status).toBe('succeeded')
    expect(r.failureReason).toBeUndefined()
    expect(r.createdAt).toBe('2024-07-25T07:19:43.000Z')
  })

  it.each([
    ['Processed', 'succeeded'],
    ['Processing', 'pending'],
    ['Error', 'failed'],
    ['Canceled', 'cancelled'],
  ])('maps documented status %s to %s', (status, expected) => {
    expect(RefundSchema.parse(transformRefund({ ...DOC_REFUND, status })).status).toBe(expected)
  })

  it('throws rather than inventing the refunded charge', () => {
    expect(() => transformRefund({ ...DOC_REFUND, refundApplications: [] })).toThrow(
      /naming a payment/,
    )
    expect(() => transformRefund({ ...DOC_REFUND, refundApplications: undefined })).toThrow(
      /naming a payment/,
    )
  })

  it('throws rather than inventing an amount or a currency', () => {
    expect(() => transformRefund({ ...DOC_REFUND, amount: undefined })).toThrow(
      /no amount or currency/,
    )
    expect(() => transformRefund({ ...DOC_REFUND, currency: undefined })).toThrow(
      /no amount or currency/,
    )
  })
})
