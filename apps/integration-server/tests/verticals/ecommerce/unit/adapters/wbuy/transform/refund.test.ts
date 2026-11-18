import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWooCommerceRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/wbuy/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawWooCommerceRefund> = {}): RawWooCommerceRefund {
  return {
    id: 3,
    amount: '29.99',
    reason: 'Defective item',
    line_items: [{ id: 1, quantity: -1, total: '-29.99' }],
    date_created_gmt: '2024-05-01T10:00:00.000Z',
    currency: 'USD',
    ...overrides,
  }
}

describe('transformRefund (wbuy)', () => {
  it('maps core fields with absolute amounts', () => {
    const result = transformRefund(makeRefund(), '1001')
    expect(result.id).toBe('3')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.reason).toBe('Defective item')
    expect(result.amount).toEqual({ amount: 2999, currency: 'USD' })
    // WC has no restock field on refunds — adapter always sets false.
    expect(result.restock).toBe(false)
  })

  it('takes the absolute value of refund line item quantity/total', () => {
    const result = transformRefund(makeRefund(), '1001')
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('1')
    expect(li.quantity).toBe(1)
    expect(li.amount).toEqual({ amount: 2999, currency: 'USD' })
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
    expect(body['amount']).toBe('29.99')
    expect(body['reason']).toBe('Defective item')
    const items = body['line_items'] as Array<{ id: string; quantity: number }>
    expect(items[0]!.id).toBe('1')
    expect(items[0]!.quantity).toBe(1)
  })
})
