import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShoplazzaRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoplazza/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawShoplazzaRefund> = {}): RawShoplazzaRefund {
  return {
    id: 80001,
    order_id: 70001,
    note: 'Defective unit',
    restock: true,
    refund_line_items: [{ id: 901, line_item_id: 701, quantity: 1, subtotal: '39.99' }],
    transactions: [{ id: 9001 }],
    processed_at: '2024-04-20T14:00:00.000Z',
    created_at: '2024-04-20T13:30:00.000Z',
    currency: 'USD',
    ...overrides,
  }
}

describe('shoplazza transformRefund', () => {
  it('maps id and orderId to strings', () => {
    const result = transformRefund(makeRaw())
    expect(result.id).toBe('80001')
    expect(result.orderId).toBe('70001')
  })

  it('derives amount from sum of refund_line_items subtotals', () => {
    // 39.99 USD = 3999 cents
    const result = transformRefund(makeRaw())
    expect(result.amount?.amount).toBe(3999)
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps refund line items with line_item_id and subtotal in minor units', () => {
    const result = transformRefund(makeRaw())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0].lineItemId).toBe('701')
    expect(result.refundLineItems![0].quantity).toBe(1)
    expect(result.refundLineItems![0].amount?.amount).toBe(3999)
  })

  it('maps transactionIds', () => {
    const result = transformRefund(makeRaw())
    expect(result.transactionIds).toEqual(['9001'])
  })

  it('maps processedAt', () => {
    const result = transformRefund(makeRaw())
    expect(result.processedAt).toBe('2024-04-20T14:00:00.000Z')
  })

  it('produces output that passes RefundSchema', () => {
    const result = transformRefund(makeRaw())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRaw())
    const back = untransformRefund(canonical)
    expect(back.note).toBe('Defective unit')
    expect(back.restock).toBe(true)
  })
})
