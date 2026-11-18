import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWooCommerceRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/woocommerce/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawWooCommerceRefund> = {}): RawWooCommerceRefund {
  return {
    id: 5001,
    parent_id: 1001,
    amount: '49.99',
    reason: 'Customer return',
    refunded_by: 1,
    refunded_payment: true,
    line_items: [
      { id: 9001, quantity: -1, total: '-49.99', total_tax: '-4.12' },
    ],
    date_created: '2024-05-10T10:00:00.000Z',
    date_created_gmt: '2024-05-10T10:00:00.000Z',
    currency: 'USD',
    ...overrides,
  }
}

describe('transformRefund (WooCommerce)', () => {
  it('maps core fields with absolute amounts', () => {
    const result = transformRefund(makeRefund(), '1001')
    expect(result.id).toBe('5001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.reason).toBe('Customer return')
    expect(result.amount).toEqual({ amount: 4999, currency: 'USD' })
    // WC has no restock field on refunds — adapter defaults to false.
    expect(result.restock).toBe(false)
  })

  it('takes the absolute value of refund line item quantity/total', () => {
    const result = transformRefund(makeRefund(), '1001')
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('9001')
    expect(li.quantity).toBe(1)
    expect(li.amount).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeRefund()
    const result = transformRefund(raw, '1001')
    expect(result.metadata).toBe(raw)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformRefund', () => {
    const canonical = transformRefund(makeRefund(), '1001')
    const body = untransformRefund(canonical)
    expect(body['amount']).toBe('49.99')
    expect(body['reason']).toBe('Customer return')
    const items = body['line_items'] as Array<{ id: string; quantity: number }>
    expect(items[0]!.id).toBe('9001')
    expect(items[0]!.quantity).toBe(1)
  })
})
