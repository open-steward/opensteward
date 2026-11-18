import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawMyCashflowRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/mycashflow/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawMyCashflowRefund> = {}): RawMyCashflowRefund {
  return {
    id: 301,
    order_id: 1001,
    amount: 29.99,
    reason: 'Wrong item received',
    note: 'Customer confirmed return',
    restock: true,
    rows: [
      {
        id: 1,
        order_row_id: 5001,
        quantity: 1,
        amount: 29.99,
      },
    ],
    created_at: '2024-03-05T00:00:00Z',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformRefund (MyCashflow)', () => {
  it('maps id to string canonical id', () => {
    const result = transformRefund(makeRaw(), '1001')
    expect(result.id).toBe('301')
  })

  it('maps order_id to orderId', () => {
    const result = transformRefund(makeRaw(), '1001')
    expect(result.orderId).toBe('1001')
  })

  it('uses orderId argument when order_id is null', () => {
    const result = transformRefund(makeRaw({ order_id: null }), 'FALLBACK-1001')
    expect(result.orderId).toBe('FALLBACK-1001')
  })

  it('converts amount major units to minor units', () => {
    const result = transformRefund(makeRaw(), '1001')
    // EUR 2 decimal digits → 29.99 × 100 = 2999
    expect(result.amount).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('maps reason and note', () => {
    const result = transformRefund(makeRaw(), '1001')
    expect(result.reason).toBe('Wrong item received')
    expect(result.note).toBe('Customer confirmed return')
  })

  it('maps restock flag', () => {
    const result = transformRefund(makeRaw(), '1001')
    expect(result.restock).toBe(true)
  })

  it('maps refund line items using order_row_id', () => {
    const result = transformRefund(makeRaw(), '1001')
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('5001')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    expect(result.refundLineItems![0]!.amount).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('maps processedAt from created_at', () => {
    const result = transformRefund(makeRaw(), '1001')
    expect(result.processedAt).toBe('2024-03-05T00:00:00Z')
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRaw(), '1001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
