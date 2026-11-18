/**
 * Wix order refund → canonical Refund.
 *
 * Fixture fields follow the `Refund` schema of List Transactions For Single
 * Order (e-commerce/orders/order-transactions/list-transactions-for-single-order.md):
 * `id`, `transactions[].paymentId/amount/refundStatus`, `details.reason`,
 * `details.lineItems[].lineItemId/quantity`, `createdDate`,
 * `summary.requestedRefund`. The order and payment ids are that page's example
 * values; the refund id is List Transactions For Multiple Orders' example refund.
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWixRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/wix/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

const ORDER = '24ca690c-8162-44ae-abda-46415767340d'
const PAYMENT = '80bcb25b-0a91-4155-b0f3-c132b0e937a6'

function makeRefund(overrides: Partial<RawWixRefund> = {}): RawWixRefund {
  return {
    id: 'ca3f9fc2-e2ac-4d7b-a657-67b8c9d4e5f3',
    transactions: [{ paymentId: PAYMENT, amount: { amount: '10.00' }, refundStatus: 'SUCCEEDED' }],
    details: {
      reason: 'Damaged in transit',
      shippingIncluded: false,
      lineItems: [{ lineItemId: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
    },
    createdDate: '2026-07-27T09:00:00.000Z',
    summary: {
      requestedRefund: { amount: '10.00', formattedAmount: '$10.00' },
      refunded: { amount: '10.00', formattedAmount: '$10.00' },
      pending: false,
    },
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('parses with RefundSchema and maps documented fields', () => {
    const r = RefundSchema.parse(transformRefund(makeRefund(), ORDER, 'USD'))
    expect(r.id).toBe(`${ORDER}:ca3f9fc2-e2ac-4d7b-a657-67b8c9d4e5f3`)
    expect(r.orderId).toBe(ORDER)
    expect(r.amount).toEqual({ amount: 1000, currency: 'USD' })
    expect(r.reason).toBe('Damaged in transit')
    expect(r.refundLineItems).toEqual([
      { lineItemId: '00000000-0000-0000-0000-000000000001', quantity: 1 },
    ])
    expect(r.createdAt).toBe('2026-07-27T09:00:00.000Z')
  })

  it('links refund transactions to the orderId:paymentId transaction ids', () => {
    const r = transformRefund(makeRefund(), ORDER, 'USD')
    expect(r.transactionIds).toEqual([`${ORDER}:${PAYMENT}`])
  })

  it('leaves the amount out when the order currency is unknown', () => {
    const r = RefundSchema.parse(transformRefund(makeRefund(), ORDER, undefined))
    expect(r.amount).toBeUndefined()
  })

  it('refuses a refund without an id', () => {
    expect(() => transformRefund(makeRefund({ id: undefined }), ORDER, 'USD')).toThrow(/id/)
  })

  it('untransformRefund maps line items', () => {
    const body = untransformRefund({ refundLineItems: [{ lineItemId: 'li', quantity: 2 }] })
    expect(body.refundItems).toEqual([{ lineItemId: 'li', quantity: 2 }])
  })
})
