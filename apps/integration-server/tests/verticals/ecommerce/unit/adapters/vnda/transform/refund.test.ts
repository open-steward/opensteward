import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWooCommerceRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/vnda/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawWooCommerceRefund> = {}): RawWooCommerceRefund {
  return {
    id: 900,
    parent_id: 1042,
    amount: '29.99',
    reason: 'Customer changed mind',
    line_items: [{ id: 201, quantity: -1, total: '-29.99' }],
    date_created_gmt: '2026-02-01T14:20:00.000Z',
    currency: 'USD',
    ...overrides,
  }
}

describe('transformRefund (VNDA/WooCommerce)', () => {
  it('maps id and orderId from explicit parameter', () => {
    const result = transformRefund(makeRefund(), '1042', 'USD')
    expect(result.id).toBe('900')
    expect(result.orderId).toBe('1042')
  })

  it('converts amount from major-unit string to minor units', () => {
    const result = transformRefund(makeRefund(), '1042', 'USD')
    expect(result.amount).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps reason', () => {
    const result = transformRefund(makeRefund(), '1042', 'USD')
    expect(result.reason).toBe('Customer changed mind')
  })

  it('sets restock to false (WC has no restock field)', () => {
    const result = transformRefund(makeRefund(), '1042', 'USD')
    expect(result.restock).toBe(false)
  })

  it('maps line items with absolute quantity (WC returns negative)', () => {
    const result = transformRefund(makeRefund(), '1042', 'USD')
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('201')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    // negative total taken as abs → 2999 minor units
    expect(result.refundLineItems![0]!.amount).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps processedAt from date_created_gmt', () => {
    const result = transformRefund(makeRefund(), '1042', 'USD')
    expect(result.processedAt).toBe('2026-02-01T14:20:00.000Z')
    expect(result.createdAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw, '1042', 'USD')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeRefund(), '1042', 'USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const refund = transformRefund(makeRefund(), '1042', 'USD')
    const body = untransformRefund(refund)
    expect(body['reason']).toBe('Customer changed mind')
    // 2999 minor / 100 = 29.99 major
    expect(body['amount']).toBe('29.99')
  })
})
