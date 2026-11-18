import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShopifyRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

describe('transformRefund (bold-commerce)', () => {
  const raw: RawShopifyRefund = {
    id: 700,
    order_id: 3001,
    note: 'Damaged in transit',
    restock: true,
    refund_line_items: [{ line_item_id: 20, quantity: 1, subtotal: '24.99', total_tax: '2.00' }],
    transactions: [{ id: 900 }],
    processed_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    currency: 'USD',
  }

  it('maps id to string', () => {
    expect(transformRefund(raw).id).toBe('700')
  })

  it('maps orderId to string', () => {
    expect(transformRefund(raw).orderId).toBe('3001')
  })

  it('maps note', () => {
    expect(transformRefund(raw).note).toBe('Damaged in transit')
  })

  it('maps restock flag', () => {
    expect(transformRefund(raw).restock).toBe(true)
  })

  it('sums refund line item subtotals as total amount in minor units', () => {
    // 24.99 USD → 2499 cents
    const result = transformRefund(raw)
    expect(result.amount?.amount).toBe(2499)
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps refund line items with lineItemId and quantity', () => {
    const result = transformRefund(raw)
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('20')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    // subtotal 24.99 → 2499 cents
    expect(result.refundLineItems![0]!.amount?.amount).toBe(2499)
  })

  it('maps transaction ids', () => {
    expect(transformRefund(raw).transactionIds).toEqual(['900'])
  })

  it('passes RefundSchema validation', () => {
    expect(() => RefundSchema.parse(transformRefund(raw))).not.toThrow()
  })

  it('handles empty refund_line_items', () => {
    const result = transformRefund({ ...raw, refund_line_items: [] })
    expect(result.refundLineItems).toBeUndefined()
    expect(result.amount).toBeUndefined()
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (bold-commerce)', () => {
  it('round-trips note and restock', () => {
    const canonical = transformRefund({
      id: 1,
      order_id: 2,
      note: 'my note',
      restock: false,
    })
    const body = untransformRefund(canonical)
    expect(body.note).toBe('my note')
    expect(body.restock).toBe(false)
  })
})
