import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShopifyRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopaccino/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawShopifyRefund> = {}): RawShopifyRefund {
  return {
    id: 20001,
    order_id: 10001,
    note: 'Defective item',
    restock: true,
    refund_line_items: [{ line_item_id: 201, quantity: 1, subtotal: '29.99' }],
    transactions: [{ id: 3001 }],
    processed_at: '2024-04-05T14:00:00.000Z',
    created_at: '2024-04-05T13:00:00.000Z',
    currency: 'USD',
    ...overrides,
  }
}

describe('shopaccino transformRefund', () => {
  it('maps id and orderId to strings', () => {
    const result = transformRefund(makeRaw())
    expect(result.id).toBe('20001')
    expect(result.orderId).toBe('10001')
  })

  it('derives total amount from sum of refund_line_items subtotals', () => {
    // subtotal 29.99 USD = 2999 cents
    const result = transformRefund(makeRaw())
    expect(result.amount?.amount).toBe(2999)
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps refund line items with lineItemId and amount', () => {
    const result = transformRefund(makeRaw())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0].lineItemId).toBe('201')
    expect(result.refundLineItems![0].quantity).toBe(1)
    expect(result.refundLineItems![0].amount?.amount).toBe(2999)
  })

  it('maps transactionIds', () => {
    const result = transformRefund(makeRaw())
    expect(result.transactionIds).toEqual(['3001'])
  })

  it('produces output that passes RefundSchema', () => {
    const result = transformRefund(makeRaw())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRaw())
    const back = untransformRefund(canonical)
    expect(back.note).toBe('Defective item')
    expect(back.restock).toBe(true)
  })
})
