import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWooCommerceRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/wildberries/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawWooCommerceRefund> = {}): RawWooCommerceRefund {
  return {
    id: 300,
    parent_id: 101,
    amount: '19.99',
    reason: 'Customer changed mind',
    currency: 'USD',
    line_items: [
      {
        id: 401,
        quantity: -1,
        total: '-19.99',
      },
    ],
    date_created_gmt: '2024-06-01T08:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (Wildberries/WooCommerce)', () => {
  it('maps core identity fields', () => {
    const result = transformRefund(makeRefund(), '101')
    expect(result.id).toBe('300')
    expect(result.orderId).toBe('101')
  })

  it('converts amount from major to minor units', () => {
    const result = transformRefund(makeRefund(), '101')
    // 19.99 USD → 1999 cents
    expect(result.amount).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('maps reason', () => {
    const result = transformRefund(makeRefund(), '101')
    expect(result.reason).toBe('Customer changed mind')
  })

  it('always sets restock to false', () => {
    const result = transformRefund(makeRefund(), '101')
    expect(result.restock).toBe(false)
  })

  it('maps line items and takes absolute value of negative quantities', () => {
    const result = transformRefund(makeRefund(), '101')
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('401')
    expect(li.quantity).toBe(1)
    expect(li.amount).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('takes absolute value of negative line item total', () => {
    const result = transformRefund(
      makeRefund({
        line_items: [{ id: 402, quantity: -2, total: '-39.98' }],
      }),
      '101',
    )
    expect(result.refundLineItems![0]!.amount).toEqual({ amount: 3998, currency: 'USD' })
    expect(result.refundLineItems![0]!.quantity).toBe(2)
  })

  it('uses currency from raw when present', () => {
    const result = transformRefund(makeRefund({ currency: 'EUR' }), '101')
    expect(result.amount?.currency).toBe('EUR')
  })

  it('falls back to passed-in currency when raw.currency is absent', () => {
    const result = transformRefund(makeRefund({ currency: undefined }), '101', 'GBP')
    expect(result.amount?.currency).toBe('GBP')
  })

  it('maps processedAt from date_created_gmt', () => {
    const result = transformRefund(makeRefund(), '101')
    expect(result.processedAt).toBe('2024-06-01T08:00:00Z')
    expect(result.createdAt).toBe('2024-06-01T08:00:00Z')
  })

  it('produces a payload that satisfies RefundSchema', () => {
    expect(() => RefundSchema.parse(transformRefund(makeRefund(), '101'))).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRefund()
    expect(transformRefund(raw, '101').metadata).toBe(raw)
  })
})

describe('untransformRefund (Wildberries/WooCommerce)', () => {
  it('converts amount from minor to major units as string', () => {
    const result = untransformRefund({
      amount: { amount: 1999, currency: 'USD' },
      reason: 'Defective',
    })
    expect(result.amount).toBe('19.99')
    expect(result.reason).toBe('Defective')
  })

  it('maps refundLineItems back to WC line_items', () => {
    const result = untransformRefund({
      refundLineItems: [
        { lineItemId: '401', quantity: 1, amount: { amount: 1999, currency: 'USD' } },
      ],
    })
    const items = result.line_items as Array<Record<string, unknown>>
    expect(items).toHaveLength(1)
    expect(items[0]!['id']).toBe('401')
    expect(items[0]!['quantity']).toBe(1)
    expect(items[0]!['refund_total']).toBe(19.99)
  })
})
