import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawIkasRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/ikas/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawIkasRefund> = {}): RawIkasRefund {
  return {
    id: 'ref-001',
    orderId: 'ord-999',
    totalRefundAmount: 50.0,
    note: 'Defective product',
    currency: 'TRY',
    refundLineItems: [{ orderLineItemId: 'li-111', quantity: 1, refundAmount: 50.0 }],
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (ikas)', () => {
  it('maps id and orderId', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('ref-001')
    expect(result.orderId).toBe('ord-999')
  })

  it('maps totalRefundAmount to minor units', () => {
    const result = transformRefund(makeRefund())
    // 50.00 TRY → 5000 minor units
    expect(result.amount).toEqual({ amount: 5000, currency: 'TRY' })
  })

  it('omits amount when totalRefundAmount is 0', () => {
    const result = transformRefund(makeRefund({ totalRefundAmount: 0 }))
    expect(result.amount).toBeUndefined()
  })

  it('omits amount when totalRefundAmount is null', () => {
    const result = transformRefund(makeRefund({ totalRefundAmount: null }))
    expect(result.amount).toBeUndefined()
  })

  it('maps note', () => {
    const result = transformRefund(makeRefund())
    expect(result.note).toBe('Defective product')
  })

  it('maps refundLineItems with minor unit amount', () => {
    const result = transformRefund(makeRefund())
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('li-111')
    expect(li.quantity).toBe(1)
    // 50.00 TRY → 5000 minor units
    expect(li.amount).toEqual({ amount: 5000, currency: 'TRY' })
  })

  it('filters line items with null orderLineItemId to empty array', () => {
    // mapRefundLineItems early-returns undefined only for empty input;
    // when items exist but all are filtered, it returns [].
    const result = transformRefund(
      makeRefund({ refundLineItems: [{ orderLineItemId: null, quantity: 1, refundAmount: 10 }] }),
    )
    expect(result.refundLineItems).toEqual([])
  })

  it('omits line item amount when refundAmount is 0', () => {
    const result = transformRefund(
      makeRefund({
        refundLineItems: [{ orderLineItemId: 'li-222', quantity: 2, refundAmount: 0 }],
      }),
    )
    expect(result.refundLineItems![0]!.amount).toBeUndefined()
  })

  it('defaults currency to TRY when not set', () => {
    const result = transformRefund(makeRefund({ currency: null }))
    expect(result.amount?.currency).toBe('TRY')
  })

  it('maps createdAt', () => {
    const result = transformRefund(makeRefund())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const body = untransformRefund(canonical)
    expect(body['orderId']).toBe('ord-999')
    expect(body['note']).toBe('Defective product')
  })
})
