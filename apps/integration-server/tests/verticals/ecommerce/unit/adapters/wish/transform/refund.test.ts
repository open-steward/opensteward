import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  WISH_REFUND_REASON_CODES,
  type RawWishRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/wish/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawWishRefund> = {}): RawWishRefund {
  return {
    order_id: 'order-abc-123',
    refund_to_customer: 9.99,
    reason_note: 'Item not as described',
    refunded_time: '2024-06-20T14:00:00Z',
    created_time: '2024-06-10T08:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (Wish)', () => {
  it('maps order_id to id', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('order-abc-123')
  })

  it('maps order_id to orderId', () => {
    const result = transformRefund(makeRefund())
    expect(result.orderId).toBe('order-abc-123')
  })

  it('converts refund_to_customer from major USD to minor units', () => {
    const result = transformRefund(makeRefund({ refund_to_customer: 9.99 }))
    expect(result.amount?.amount).toBe(999)
    expect(result.amount?.currency).toBe('USD')
  })

  it('omits amount when refund_to_customer is 0', () => {
    const result = transformRefund(makeRefund({ refund_to_customer: 0 }))
    expect(result.amount).toBeUndefined()
  })

  it('maps reason_note to note', () => {
    const result = transformRefund(makeRefund())
    expect(result.note).toBe('Item not as described')
  })

  it('maps refunded_time to processedAt', () => {
    const result = transformRefund(makeRefund())
    expect(result.processedAt).toBe('2024-06-20T14:00:00.000Z')
  })

  it('maps created_time to createdAt', () => {
    const result = transformRefund(makeRefund())
    expect(result.createdAt).toBe('2024-06-10T08:00:00.000Z')
  })

  it('handles null refund_to_customer gracefully', () => {
    const result = transformRefund(makeRefund({ refund_to_customer: null }))
    expect(result.amount).toBeUndefined()
  })

  it('handles string refund amount', () => {
    const result = transformRefund(makeRefund({ refund_to_customer: '25.00' }))
    expect(result.amount?.amount).toBe(2500)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (Wish)', () => {
  it('maps orderId to order_id', () => {
    const body = untransformRefund({ orderId: 'order-abc-123' })
    expect(body['order_id']).toBe('order-abc-123')
  })

  it('maps note to reason_note', () => {
    const body = untransformRefund({ note: 'Item broken' })
    expect(body['reason_note']).toBe('Item broken')
  })

  it('always includes reason_code=OTHER (7)', () => {
    const body = untransformRefund({})
    expect(body['reason_code']).toBe(WISH_REFUND_REASON_CODES.OTHER)
    expect(body['reason_code']).toBe(7)
  })
})
