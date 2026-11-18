import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWooCommerceRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/gambio/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawWooCommerceRefund> = {}): RawWooCommerceRefund {
  return {
    id: 800,
    parent_id: 1001,
    amount: '29.99',
    reason: 'Customer changed mind',
    line_items: [
      {
        id: 9001,
        // WC returns negative quantities on refund line items
        quantity: -1,
        total: '-29.99',
      },
    ],
    date_created_gmt: '2024-03-05T00:00:00Z',
    currency: 'USD',
    ...overrides,
  }
}

describe('transformRefund (Gambio / WooCommerce)', () => {
  it('maps core fields and stringifies id', () => {
    const result = transformRefund(makeRefund(), '1001')
    expect(result.id).toBe('800')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.reason).toBe('Customer changed mind')
  })

  it('converts amount (absolute) from major to minor units', () => {
    const result = transformRefund(makeRefund(), '1001')
    expect(result.amount).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('handles negative WC amount correctly (Math.abs)', () => {
    const result = transformRefund(makeRefund({ amount: '-29.99' }), '1001')
    expect(result.amount?.amount).toBe(2999)
  })

  it('takes absolute value of negative line item quantity', () => {
    const result = transformRefund(makeRefund(), '1001')
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('9001')
    expect(li.quantity).toBe(1)
    // Line item total is also negative: Math.abs(-29.99) → 2999 minor units
    expect(li.amount).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('hardcodes restock to false (WC does not expose this)', () => {
    const result = transformRefund(makeRefund(), '1001')
    expect(result.restock).toBe(false)
  })

  it('maps processedAt and createdAt to date_created_gmt', () => {
    const result = transformRefund(makeRefund(), '1001')
    expect(result.processedAt).toBe('2024-03-05T00:00:00Z')
    expect(result.createdAt).toBe('2024-03-05T00:00:00Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw, '1001')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefund(), '1001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRefund(), '1001')
    const back = untransformRefund(canonical)
    expect(back.reason).toBe('Customer changed mind')
    // untransform converts minor units (2999) → major decimal string (29.99)
    expect(back.amount).toBe('29.99')
  })
})
