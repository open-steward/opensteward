import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShopifyRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/jimdo/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

describe('transformRefund (jimdo)', () => {
  const raw: RawShopifyRefund = {
    id: 300,
    order_id: 1001,
    note: 'Customer returned item',
    restock: true,
    refund_line_items: [{ line_item_id: 11, quantity: 1, subtotal: '49.99', total_tax: '4.37' }],
    transactions: [{ id: 700 }],
    processed_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    currency: 'USD',
  }

  it('maps id to string', () => {
    const result = transformRefund(raw)
    expect(result.id).toBe('300')
  })

  it('maps orderId to string', () => {
    const result = transformRefund(raw)
    expect(result.orderId).toBe('1001')
  })

  it('computes total amount as sum of line item subtotals in minor units', () => {
    const result = transformRefund(raw)
    // 49.99 USD → 4999 cents
    expect(result.amount).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps note and restock flag', () => {
    const result = transformRefund(raw)
    expect(result.note).toBe('Customer returned item')
    expect(result.restock).toBe(true)
  })

  it('maps refundLineItems with string ids', () => {
    const result = transformRefund(raw)
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('11')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    // subtotal 49.99 → 4999
    expect(result.refundLineItems![0]!.amount).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps transactionIds as string array', () => {
    const result = transformRefund(raw)
    expect(result.transactionIds).toEqual(['700'])
  })

  it('produces schema-valid output', () => {
    const result = transformRefund(raw)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('omits amount when all line item subtotals are absent/zero', () => {
    const result = transformRefund({
      ...raw,
      refund_line_items: [{ line_item_id: 11, quantity: 1 }],
    })
    expect(result.amount).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const result = transformRefund(raw)
    const back = untransformRefund(result)
    expect(back.note).toBe(raw.note)
    expect(back.restock).toBe(true)
  })
})
