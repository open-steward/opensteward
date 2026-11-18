import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWooCommerceRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/yampi/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawWooCommerceRefund> = {}): RawWooCommerceRefund {
  return {
    id: 99,
    parent_id: 101,
    amount: '15.00',
    reason: 'Damaged item',
    date_created_gmt: '2024-03-10T08:00:00Z',
    currency: 'USD',
    ...overrides,
  }
}

describe('transformRefund (Yampi/WooCommerce)', () => {
  it('maps id and orderId', () => {
    const result = transformRefund(makeRefund(), '101')
    expect(result.id).toBe('99')
    expect(result.orderId).toBe('101')
  })

  it('converts amount from major to minor units', () => {
    const result = transformRefund(makeRefund(), '101')
    expect(result.amount).toEqual({ amount: 1500, currency: 'USD' })
  })

  it('maps reason', () => {
    const result = transformRefund(makeRefund(), '101')
    expect(result.reason).toBe('Damaged item')
  })

  it('always sets restock to false', () => {
    const result = transformRefund(makeRefund(), '101')
    expect(result.restock).toBe(false)
  })

  it('maps line items and takes absolute value of negative quantities', () => {
    const result = transformRefund(
      makeRefund({
        line_items: [{ id: 301, quantity: -2, total: '-10.00' }],
      }),
      '101',
    )
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('301')
    expect(result.refundLineItems![0]!.quantity).toBe(2)
    expect(result.refundLineItems![0]!.amount).toEqual({ amount: 1000, currency: 'USD' })
  })

  it('maps processedAt from date_created_gmt', () => {
    const result = transformRefund(makeRefund(), '101')
    expect(result.processedAt).toBe('2024-03-10T08:00:00Z')
    expect(result.createdAt).toBe('2024-03-10T08:00:00Z')
  })

  it('uses provided currency parameter when raw.currency is absent', () => {
    const result = transformRefund(makeRefund({ currency: undefined }), '101', 'EUR')
    expect(result.amount?.currency).toBe('EUR')
  })

  it('produces a payload that satisfies RefundSchema', () => {
    expect(() => RefundSchema.parse(transformRefund(makeRefund(), '101'))).not.toThrow()
  })
})

describe('untransformRefund (Yampi/WooCommerce)', () => {
  it('converts minor amount back to decimal major string', () => {
    const result = untransformRefund({
      amount: { amount: 1500, currency: 'USD' },
      reason: 'Wrong size',
    })
    expect(result.amount).toBe('15')
    expect(result.reason).toBe('Wrong size')
  })

  it('maps line items back to WC shape', () => {
    const result = untransformRefund({
      refundLineItems: [
        { lineItemId: '301', quantity: 1, amount: { amount: 999, currency: 'USD' } },
      ],
    })
    const items = result.line_items as Array<{ id: string; quantity: number; refund_total: number }>
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe('301')
    expect(items[0]!.quantity).toBe(1)
    expect(items[0]!.refund_total).toBeCloseTo(9.99)
  })
})
