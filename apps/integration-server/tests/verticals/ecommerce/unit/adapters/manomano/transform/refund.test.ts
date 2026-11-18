import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawManomanoRefund,
  type RawManomanoRefundLine,
} from '../../../../../../../src/verticals/ecommerce/adapters/manomano/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawManomanoRefund> = {}): RawManomanoRefund {
  return {
    id: 'REF-001',
    order_id: 'ORD-999',
    reason: 'Customer changed mind',
    note: 'Refunded one item.',
    amount: 19.99,
    currency: 'EUR',
    refund_lines: [{ order_line_id: 'LI-1', quantity: 1, amount: 19.99 }],
    created_at: '2024-03-01T00:00:00Z',
    processed_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (ManoMano)', () => {
  it('maps core id and orderId fields', () => {
    const result = transformRefund(makeRaw())
    expect(result.id).toBe('REF-001')
    expect(result.orderId).toBe('ORD-999')
  })

  it('converts major-unit amount to minor units (EUR → cents)', () => {
    const result = transformRefund(makeRaw({ amount: 19.99, currency: 'EUR' }))
    expect(result.amount).toEqual({ amount: 1999, currency: 'EUR' })
  })

  it('prefers note over reason for the note field', () => {
    const result = transformRefund(makeRaw({ note: 'My note', reason: 'reason text' }))
    expect(result.note).toBe('My note')
  })

  it('falls back to reason when note is null', () => {
    const result = transformRefund(makeRaw({ note: null, reason: 'reason text' }))
    expect(result.note).toBe('reason text')
  })

  it('maps refund line items correctly', () => {
    const result = transformRefund(makeRaw())
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('LI-1')
    expect(li.quantity).toBe(1)
    expect(li.amount).toEqual({ amount: 1999, currency: 'EUR' })
  })

  it('maps ISO datetime fields', () => {
    const result = transformRefund(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.processedAt).toBe('2024-03-02T00:00:00.000Z')
  })

  it('defaults to EUR when currency is absent', () => {
    const result = transformRefund(makeRaw({ currency: undefined, amount: 10.0 }))
    expect(result.amount).toEqual({ amount: 1000, currency: 'EUR' })
  })

  it('omits amount when raw amount is null', () => {
    const result = transformRefund(makeRaw({ amount: null }))
    expect(result.amount).toBeUndefined()
  })

  it('omits refundLineItems when refund_lines is empty', () => {
    const result = transformRefund(makeRaw({ refund_lines: [] }))
    expect(result.refundLineItems).toBeUndefined()
  })

  it('casts numeric id to string', () => {
    const result = transformRefund(makeRaw({ id: 42, order_id: 100 }))
    expect(result.id).toBe('42')
    expect(result.orderId).toBe('100')
  })

  it('produces schema-valid output', () => {
    const result = transformRefund(makeRaw())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })
})

describe('untransformRefund (ManoMano)', () => {
  it('returns note and refund_lines', () => {
    const canonical = {
      id: 'REF-001',
      orderId: 'ORD-999',
      note: 'Returned item',
      refundLineItems: [{ lineItemId: 'LI-1', quantity: 2 }],
      metadata: {},
    }
    const result = untransformRefund(canonical)
    expect(result.note).toBe('Returned item')
    expect(result.refund_lines).toEqual([{ order_line_id: 'LI-1', quantity: 2 }])
  })

  it('returns undefined refund_lines when refundLineItems is absent', () => {
    const result = untransformRefund({ note: 'test', metadata: {} })
    expect(result.refund_lines).toBeUndefined()
  })
})
