import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/loyverse/transform/refund'
import type { RawLoyverseReceipt } from '../../../../../../../src/verticals/ecommerce/adapters/loyverse/transform/order'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawLoyverseReceipt> = {}): RawLoyverseReceipt {
  return {
    receipt_number: 'REF-1042',
    receipt_type: 'REFUND',
    refund_for: 'RCP-1042',
    total_money: -19.98,
    note: 'Customer changed mind',
    created_at: '2024-03-02T10:00:00Z',
    line_items: [
      {
        id: 'li_001',
        variant_id: 'var_001',
        quantity: -2,
        total_money: -19.98,
      },
    ],
    ...overrides,
  }
}

describe('transformRefund (Loyverse)', () => {
  it('maps receipt_number to id', () => {
    const result = transformRefund(makeRaw())
    expect(result.id).toBe('REF-1042')
  })

  it('maps refund_for to orderId', () => {
    const result = transformRefund(makeRaw())
    expect(result.orderId).toBe('RCP-1042')
  })

  it('falls back to receipt_number as orderId when refund_for is absent', () => {
    const result = transformRefund(makeRaw({ refund_for: null }))
    expect(result.orderId).toBe('REF-1042')
  })

  it('converts total_money (absolute value) to minor units', () => {
    const result = transformRefund(makeRaw({ total_money: -19.98 }))
    expect(result.amount).toEqual({ amount: 1998, currency: 'USD' })
  })

  it('maps note', () => {
    const result = transformRefund(makeRaw())
    expect(result.note).toBe('Customer changed mind')
  })

  it('maps createdAt and processedAt from created_at', () => {
    const result = transformRefund(makeRaw())
    expect(result.createdAt).toBe('2024-03-02T10:00:00Z')
    expect(result.processedAt).toBe('2024-03-02T10:00:00Z')
  })

  it('falls back to receipt_date for dates when created_at is absent', () => {
    const result = transformRefund(
      makeRaw({ created_at: undefined, receipt_date: '2024-03-02T09:00:00Z' }),
    )
    expect(result.createdAt).toBe('2024-03-02T09:00:00Z')
  })

  it('maps refundLineItems with absolute quantities and minor unit amounts', () => {
    const result = transformRefund(makeRaw())
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('li_001')
    expect(li.quantity).toBe(2) // absolute value of -2
    expect(li.amount).toEqual({ amount: 1998, currency: 'USD' })
  })

  it('returns undefined refundLineItems when line_items is empty', () => {
    const result = transformRefund(makeRaw({ line_items: [] }))
    expect(result.refundLineItems).toBeUndefined()
  })

  it('uses explicit currency', () => {
    const result = transformRefund(makeRaw(), 'EUR')
    expect(result.amount?.currency).toBe('EUR')
  })

  it('produces schema-valid output', () => {
    const result = transformRefund(makeRaw())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output with minimal input', () => {
    const minimal: RawLoyverseReceipt = { receipt_number: 'REF-MIN' }
    const result = transformRefund(minimal)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (Loyverse)', () => {
  it('sets receipt_type to REFUND', () => {
    const result = untransformRefund({ orderId: 'RCP-1042' })
    expect(result.receipt_type).toBe('REFUND')
  })

  it('maps orderId to refund_for', () => {
    const result = untransformRefund({ orderId: 'RCP-1042' })
    expect(result.refund_for).toBe('RCP-1042')
  })

  it('maps line items with negated quantities and major-unit prices', () => {
    const result = untransformRefund({
      refundLineItems: [
        {
          lineItemId: 'li_001',
          quantity: 2,
          amount: { amount: 1998, currency: 'USD' },
        },
      ],
    })
    const items = result.line_items as Array<{ quantity: number; price: number }>
    expect(items[0]!.quantity).toBe(-2)
    expect(items[0]!.price).toBeCloseTo(-19.98, 5)
  })
})
