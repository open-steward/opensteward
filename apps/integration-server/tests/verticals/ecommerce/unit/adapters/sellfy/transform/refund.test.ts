import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShopifyRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/sellfy/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawShopifyRefund> = {}): RawShopifyRefund {
  return {
    id: 6001,
    order_id: 1001,
    note: 'Customer requested refund',
    restock: true,
    refund_line_items: [
      {
        line_item_id: 2001,
        quantity: 1,
        subtotal: '19.99',
        total_tax: '1.80',
      },
    ],
    transactions: [{ id: 7001 }],
    processed_at: '2024-05-10T14:00:00Z',
    created_at: '2024-05-10T13:55:00Z',
    currency: 'USD',
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('maps id and order_id as strings', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('6001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
  })

  it('maps note and restock', () => {
    const result = transformRefund(makeRefund())
    expect(result.note).toBe('Customer requested refund')
    expect(result.restock).toBe(true)
  })

  it('maps refund_line_items to refundLineItems with stringified ids', () => {
    const result = transformRefund(makeRefund())
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('2001')
    expect(li.quantity).toBe(1)
  })

  it('converts refund line item subtotals to minor units', () => {
    const result = transformRefund(makeRefund())
    const li = result.refundLineItems![0]!
    // $19.99 → 1999 cents
    expect(li.amount).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('sums refund_line_items subtotals for top-level amount', () => {
    const result = transformRefund(makeRefund())
    // $19.99 total → 1999 cents
    expect(result.amount).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('maps multiple line items and sums correctly', () => {
    const raw = makeRefund({
      refund_line_items: [
        { line_item_id: 2001, quantity: 1, subtotal: '10.00' },
        { line_item_id: 2002, quantity: 2, subtotal: '20.00' },
      ],
    })
    const result = transformRefund(raw)
    expect(result.refundLineItems).toHaveLength(2)
    // $10 + $20 = $30 → 3000 cents
    expect(result.amount).toEqual({ amount: 3000, currency: 'USD' })
  })

  it('maps transactionIds as strings', () => {
    const result = transformRefund(makeRefund())
    expect(result.transactionIds).toEqual(['7001'])
  })

  it('maps processedAt and createdAt', () => {
    const result = transformRefund(makeRefund())
    expect(result.processedAt).toBe('2024-05-10T14:00:00Z')
    expect(result.createdAt).toBe('2024-05-10T13:55:00Z')
  })

  it('omits amount when there are no refund_line_items', () => {
    const result = transformRefund(makeRefund({ refund_line_items: [] }))
    expect(result.amount).toBeUndefined()
    expect(result.refundLineItems).toBeUndefined()
  })

  it('defaults to USD currency when not specified', () => {
    const raw = makeRefund({ currency: undefined })
    const result = transformRefund(raw)
    expect(result.amount?.currency).toBe('USD')
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

  it('round-trips writable fields via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const raw = untransformRefund(canonical)
    expect(raw.note).toBe('Customer requested refund')
    expect(raw.restock).toBe(true)
    expect(
      (raw.refund_line_items as Array<{ line_item_id: string; quantity: number }>)[0]!.line_item_id,
    ).toBe('2001')
  })
})
