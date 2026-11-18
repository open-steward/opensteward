import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawSapoRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/sapo/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawSapoRefund> = {}): RawSapoRefund {
  return {
    id: 7501,
    order_id: 1001,
    note: 'Khách hàng đổi ý',
    restock: true,
    currency: 'VND',
    refund_line_items: [
      { line_item_id: 201, quantity: 1, subtotal: '150000', total_tax: '0' },
    ],
    transactions: [{ id: 8001 }],
    processed_on: '2024-04-05T10:00:00Z',
    created_on: '2024-04-05T09:50:00Z',
    ...overrides,
  }
}

describe('transformRefund (Sapo)', () => {
  it('stringifies id and order_id', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('7501')
    expect(result.orderId).toBe('1001')
  })

  it('maps note and restock fields', () => {
    const result = transformRefund(makeRefund())
    expect(result.note).toBe('Khách hàng đổi ý')
    expect(result.restock).toBe(true)
  })

  it('sums refund_line_items subtotals into amount with VND (no scaling)', () => {
    // VND has 0 exponent: majorToMinor(150000, 'VND') === 150000
    const result = transformRefund(makeRefund())
    expect(result.amount).toEqual({ amount: 150000, currency: 'VND' })
  })

  it('maps refund line items with canonical lineItemId', () => {
    const result = transformRefund(makeRefund())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('201')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    expect(result.refundLineItems![0]!.amount).toEqual({ amount: 150000, currency: 'VND' })
  })

  it('maps transaction ids', () => {
    const result = transformRefund(makeRefund())
    expect(result.transactionIds).toEqual(['8001'])
  })

  it('maps processed_on → processedAt and created_on → createdAt', () => {
    const result = transformRefund(makeRefund())
    expect(result.processedAt).toBe('2024-04-05T10:00:00Z')
    expect(result.createdAt).toBe('2024-04-05T09:50:00Z')
  })

  it('omits amount when no line items have subtotals', () => {
    const result = transformRefund(makeRefund({ refund_line_items: [] }))
    expect(result.amount).toBeUndefined()
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
    const raw = untransformRefund(canonical)
    expect(raw.note).toBe('Khách hàng đổi ý')
    expect(raw.restock).toBe(true)
    expect(
      (raw.refund_line_items as Array<{ line_item_id: string }>)[0]!.line_item_id,
    ).toBe('201')
  })
})
