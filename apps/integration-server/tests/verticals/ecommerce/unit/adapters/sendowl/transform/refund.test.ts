/**
 * SendOwl Refund → canonical Refund.
 *
 * SendOwl has no standalone refund resource: refunds are an embedded
 * `refund_transactions[].refund_transaction` array on the order object
 * (see the full order example on
 * https://dashboard.sendowl.com/developers/api/orders), and are created via
 * `POST /api/v1/orders/#{order_id}/refund` (amount, cancel_subscription,
 * revoke_access). Since a `refund_transaction` carries no id of its own,
 * this module synthesizes one as `${orderId}:${index}`.
 */
import { describe, it, expect } from 'vitest'
import {
  extractRefunds,
  transformRefundTransaction,
  type RawSendOwlRefundTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/sendowl/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeTxn(overrides: Partial<RawSendOwlRefundTransaction> = {}): RawSendOwlRefundTransaction {
  return {
    amount: '-3.00',
    currency: 'GBP',
    occurred_at: '2011-05-20T09:30:00Z',
    reason: 'requested_by_customer',
    ...overrides,
  }
}

describe('transformRefundTransaction (sendowl)', () => {
  it('synthesizes the composite id from orderId + index', () => {
    const result = transformRefundTransaction(makeTxn(), '3101', 0)
    expect(result.id).toBe('3101:0')
    expect(result.orderId).toBe('3101')
  })

  it('converts the negative decimal-string amount to a positive minor-unit Money', () => {
    const result = transformRefundTransaction(makeTxn({ amount: '-3.00' }), '3101', 0)
    expect(result.amount).toEqual({ amount: 300, currency: 'GBP' })
  })

  it('maps reason and processedAt', () => {
    const result = transformRefundTransaction(makeTxn(), '3101', 0)
    expect(result.reason).toBe('requested_by_customer')
    expect(result.processedAt).toBe('2011-05-20T09:30:00Z')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeTxn()
    expect(transformRefundTransaction(raw, '3101', 0).metadata).toEqual(raw)
  })

  it('satisfies RefundSchema', () => {
    expect(() => RefundSchema.parse(transformRefundTransaction(makeTxn(), '3101', 0))).not.toThrow()
  })
})

describe('extractRefunds (sendowl)', () => {
  it('returns an empty array when the order has no refund_transactions', () => {
    expect(extractRefunds('3101', undefined)).toEqual([])
    expect(extractRefunds('3101', [])).toEqual([])
  })

  it('indexes each embedded refund_transaction in order', () => {
    const refunds = extractRefunds('3101', [
      { refund_transaction: makeTxn({ amount: '-3.00' }) },
      { refund_transaction: makeTxn({ amount: '-1.00' }) },
    ])
    expect(refunds.map((r) => r.id)).toEqual(['3101:0', '3101:1'])
  })
})
