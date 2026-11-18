/**
 * Haravan Refund transform — verified against
 * https://docs.haravan.com/docs/omni-apis/refunds/ raw doc HTML: no top-level
 * `amount` field (computed from `refund_line_items[].line_item.price *
 * quantity`, both real fields), `transactions[]` embeds full transaction
 * objects.
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawHaravanRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/haravan/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawHaravanRefund> = {}): RawHaravanRefund {
  return {
    id: 1011637849,
    order_id: 1231656323,
    note: 'wrong size',
    user_id: 200000497867,
    refund_line_items: [
      { id: 1013304743, line_item_id: 1308268732, quantity: 2, line_item: { price: 15000000 } },
    ],
    transactions: [{ id: 1094983274 }],
    created_at: '2021-10-15T07:36:32.377Z',
    ...overrides,
  }
}

describe('transformRefund (haravan)', () => {
  it('maps id, orderId, and note', () => {
    const result = transformRefund(makeRaw(), 'VND')
    expect(result.id).toBe('1011637849')
    expect(result.orderId).toBe('1231656323')
    expect(result.note).toBe('wrong size')
  })

  it('computes amount as sum of line_item.price * quantity — never a default', () => {
    const result = transformRefund(makeRaw(), 'VND')
    expect(result.amount).toEqual({ amount: 30000000, currency: 'VND' })
  })

  it('leaves amount undefined (not 0) when no line carries a price', () => {
    const result = transformRefund(makeRaw({ refund_line_items: [{ id: 1, line_item_id: 2, quantity: 1 }] }), 'VND')
    expect(result.amount).toBeUndefined()
  })

  it('maps transactionIds from the embedded transactions array', () => {
    expect(transformRefund(makeRaw(), 'VND').transactionIds).toEqual(['1094983274'])
  })

  it('produces a payload that satisfies RefundSchema', () => {
    expect(() => RefundSchema.parse(transformRefund(makeRaw(), 'VND'))).not.toThrow()
  })

  it('round-trips writable fields via untransformRefund', () => {
    const body = untransformRefund(transformRefund(makeRaw(), 'VND'))
    expect(body['note']).toBe('wrong size')
  })
})
