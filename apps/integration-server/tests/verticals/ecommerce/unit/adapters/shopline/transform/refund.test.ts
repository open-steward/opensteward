import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShoplineRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopline/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawShoplineRefund> = {}): RawShoplineRefund {
  return {
    id: 2001,
    order_id: 1001,
    note: 'Customer changed mind',
    restock: true,
    currency: 'USD',
    refund_line_items: [{ line_item_id: 9001, quantity: 1, subtotal: '49.99', total_tax: '4.12' }],
    transactions: [{ id: 6002 }],
    processed_at: '2024-01-20T10:00:00.000Z',
    created_at: '2024-01-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('maps id and orderId as strings', () => {
    const result = transformRefund(makeRaw())
    expect(result.id).toBe('2001')
    expect(result.orderId).toBe('1001')
  })

  it('sums line-item subtotals for total amount in minor units', () => {
    const result = transformRefund(makeRaw())
    // 49.99 USD → 4999 cents
    expect(result.amount).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('sums multiple line items for amount', () => {
    const result = transformRefund(
      makeRaw({
        refund_line_items: [
          { line_item_id: 9001, quantity: 1, subtotal: '49.99' },
          { line_item_id: 9002, quantity: 2, subtotal: '30.00' },
        ],
      }),
    )
    // (49.99 + 30.00) = 79.99 → 7999 cents
    expect(result.amount).toEqual({ amount: 7999, currency: 'USD' })
  })

  it('omits amount when no refund_line_items', () => {
    const result = transformRefund(makeRaw({ refund_line_items: [] }))
    expect(result.amount).toBeUndefined()
  })

  it('maps note and restock', () => {
    const result = transformRefund(makeRaw())
    expect(result.note).toBe('Customer changed mind')
    expect(result.restock).toBe(true)
  })

  it('maps refundLineItems', () => {
    const result = transformRefund(makeRaw())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('9001')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    expect(result.refundLineItems![0]!.amount).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('maps transactionIds', () => {
    const result = transformRefund(makeRaw())
    expect(result.transactionIds).toEqual(['6002'])
  })

  it('maps processedAt and createdAt', () => {
    const result = transformRefund(makeRaw())
    expect(result.processedAt).toBe('2024-01-20T10:00:00.000Z')
    expect(result.createdAt).toBe('2024-01-20T10:00:00.000Z')
  })

  it('uses currency arg as fallback when raw.currency absent', () => {
    const result = transformRefund(makeRaw({ currency: undefined }), 'EUR')
    expect(result.amount?.currency).toBe('EUR')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRaw()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies RefundSchema', () => {
    const result = transformRefund(makeRaw())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRaw())
    const body = untransformRefund(canonical)
    expect(body.note).toBe('Customer changed mind')
    expect(body.restock).toBe(true)
    const li = (body.refund_line_items as Record<string, unknown>[])[0]!
    expect(li.line_item_id).toBe('9001')
    expect(li.quantity).toBe(1)
  })
})
