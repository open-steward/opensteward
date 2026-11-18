/**
 * Swell refund transform, against "The refund model" example
 * (https://developers.swell.is/backend-api/refunds).
 */
import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawSwellRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/swell/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

const DOC_REFUND: RawSwellRefund = {
  id: '60f199509111e70000000042',
  amount: 20,
  method: 'card',
  parent_id: '60f199509111e70000000045',
  async: false,
  currency: 'USD',
  date_created: '2021-07-16T14:36:00.293Z',
  date_updated: '2021-07-16T14:36:00.293Z',
  error: null,
  number: 102934,
  order_id: '60f199509111e70000000044',
  reason_message: 'Customer returned EX2001',
  status: 'success',
  success: true,
  transaction_id: 're_1XNoXdEAeofUkt5SrbA6Swow',
}

describe('swell transformRefund', () => {
  it('maps the documented refund example and parses as a Refund', () => {
    const r = RefundSchema.parse(transformRefund(DOC_REFUND))
    expect(r.id).toBe('60f199509111e70000000042')
    expect(r.orderId).toBe('60f199509111e70000000044')
    expect(r.amount).toEqual({ amount: 2000, currency: 'USD' })
    expect(r.note).toBe('Customer returned EX2001')
    expect(r.transactionIds).toEqual(['60f199509111e70000000045'])
    expect(r.createdAt).toBe('2021-07-16T14:36:00.293Z')
  })

  it("uses the caller's order when the refund names none, and refuses otherwise", () => {
    const r = RefundSchema.parse(transformRefund({ ...DOC_REFUND, order_id: null }, 'ord_9'))
    expect(r.orderId).toBe('ord_9')
    expect(() => transformRefund({ ...DOC_REFUND, order_id: null })).toThrow(/no order_id/)
  })

  it('omits money without a currency', () => {
    const r = RefundSchema.parse(
      transformRefund({ ...DOC_REFUND, currency: null, reason: 'returned' }),
    )
    expect(r.amount).toBeUndefined()
    expect(r.reason).toBe('returned')
  })
})
