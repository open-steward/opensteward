import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawBigCommerceRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/bigcommerce/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawBigCommerceRefund> = {}): RawBigCommerceRefund {
  return {
    id: 5001,
    order_id: 1001,
    reason: 'Customer return',
    total_amount: 49.99,
    items: [
      { item_type: 'PRODUCT', item_id: 9001, quantity: 1, amount: 49.99 },
    ],
    payments: [{ id: 6002, amount: 49.99 }],
    created: '2024-05-10T10:00:00Z',
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('5001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.note).toBe('Customer return')
    expect(result.amount).toEqual({ amount: 4999, currency: 'USD' })
    expect(result.transactionIds).toEqual(['6002'])
  })

  it('maps refund line items', () => {
    const result = transformRefund(makeRefund())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]).toEqual({
      lineItemId: '9001',
      quantity: 1,
      amount: { amount: 4999, currency: 'USD' },
    })
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
