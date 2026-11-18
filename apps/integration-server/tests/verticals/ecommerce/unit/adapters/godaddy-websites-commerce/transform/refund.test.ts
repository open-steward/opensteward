import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShopifyRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawShopifyRefund> = {}): RawShopifyRefund {
  return {
    id: 700,
    order_id: 1001,
    note: 'Customer returned item',
    restock: true,
    refund_line_items: [{ line_item_id: 9001, quantity: 1, subtotal: '29.99' }],
    transactions: [{ id: 6001 }],
    processed_at: '2024-03-05T00:00:00Z',
    created_at: '2024-03-05T00:00:00Z',
    currency: 'USD',
    ...overrides,
  }
}

describe('transformRefund (GoDaddy Websites + Commerce / Shopify shapes)', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('700')
    expect(result.orderId).toBe('1001')
    expect(result.note).toBe('Customer returned item')
    expect(result.restock).toBe(true)
  })

  it('sums line item subtotals as total amount', () => {
    const result = transformRefund(makeRefund())
    expect(result.amount).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps refundLineItems with minor-unit amounts', () => {
    const result = transformRefund(makeRefund())
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('9001')
    expect(li.quantity).toBe(1)
    expect(li.amount).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('returns undefined amount when total is 0', () => {
    const result = transformRefund(
      makeRefund({ refund_line_items: [{ line_item_id: 1, quantity: 1, subtotal: '0' }] }),
    )
    expect(result.amount).toBeUndefined()
  })

  it('maps transactionIds', () => {
    const result = transformRefund(makeRefund())
    expect(result.transactionIds).toEqual(['6001'])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const back = untransformRefund(canonical)
    expect(back.note).toBe('Customer returned item')
    expect(back.notify).toBe(false)
    expect(back.restock).toBe(true)
  })
})
