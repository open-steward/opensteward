import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWooCommerceRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/fnac-marketplace/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawWooCommerceRefund> = {}): RawWooCommerceRefund {
  return {
    id: 701,
    parent_id: 9001,
    amount: '29.99',
    reason: 'Product damaged',
    refunded_payment: true,
    line_items: [{ id: 101, quantity: -1, total: '-29.99' }],
    date_created_gmt: '2024-03-06T00:00:00Z',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformRefund (FNAC/WooCommerce)', () => {
  it('maps id and orderId (from param)', () => {
    const result = transformRefund(makeRaw(), '9001')
    expect(result.id).toBe('701')
    expect(result.orderId).toBe('9001')
  })

  it('maps reason', () => {
    const result = transformRefund(makeRaw(), '9001')
    expect(result.reason).toBe('Product damaged')
  })

  it('converts amount to minor units and takes absolute value', () => {
    // 29.99 EUR → 2999 minor units
    const result = transformRefund(makeRaw({ amount: '29.99' }), '9001', 'EUR')
    expect(result.amount).toEqual({ amount: 2999, currency: 'EUR' })
  })

  it('sets restock to false', () => {
    const result = transformRefund(makeRaw(), '9001')
    expect(result.restock).toBe(false)
  })

  it('maps refund line items with abs quantity', () => {
    const result = transformRefund(makeRaw(), '9001')
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('101')
    expect(result.refundLineItems![0]!.quantity).toBe(1) // abs(-1)
  })

  it('maps processedAt from date_created_gmt', () => {
    const result = transformRefund(makeRaw(), '9001')
    expect(result.processedAt).toBe('2024-03-06T00:00:00Z')
    expect(result.createdAt).toBe('2024-03-06T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeRaw()
    const result = transformRefund(raw, '9001')
    expect(result.metadata).toBe(raw)
  })

  it('round-trips via untransformRefund', () => {
    const result = transformRefund(makeRaw(), '9001')
    const body = untransformRefund(result)
    expect(body.reason).toBe('Product damaged')
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeRaw(), '9001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
