import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawSolidusReturnAuthorization,
} from '../../../../../../../src/verticals/ecommerce/adapters/solidus/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturnAuth(
  overrides: Partial<RawSolidusReturnAuthorization> = {},
): RawSolidusReturnAuthorization {
  return {
    id: 201,
    order_id: 500,
    number: 'RA-001',
    state: 'authorized',
    memo: 'Customer returned defective item',
    amount: '59.99',
    currency: 'USD',
    return_items: [
      {
        id: 1,
        inventory_unit_id: 5,
        line_item_id: 2001,
        amount: '59.99',
        reception_status: 'received',
        acceptance_status: 'accepted',
      },
    ],
    created_at: '2024-03-01T09:00:00.000Z',
    updated_at: '2024-03-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformRefund (Solidus)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeReturnAuth())
    expect(result.id).toBe('201')
    expect(result.orderId).toBe('500')
    expect(result.amount).toEqual({ amount: 5999, currency: 'USD' })
    expect(result.note).toBe('Customer returned defective item')
    expect(result.restock).toBe(true)
  })

  it('maps return items to refund line items', () => {
    const result = transformRefund(makeReturnAuth())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]).toMatchObject({
      lineItemId: '2001',
      quantity: 1,
      amount: { amount: 5999, currency: 'USD' },
    })
  })

  it('handles missing return items', () => {
    const result = transformRefund(makeReturnAuth({ return_items: undefined }))
    expect(result.refundLineItems).toBeUndefined()
  })

  it('handles missing memo', () => {
    const result = transformRefund(makeReturnAuth({ memo: null }))
    expect(result.note).toBeUndefined()
  })

  it('falls back to reason when memo is null (Solidus-specific)', () => {
    const result = transformRefund(
      makeReturnAuth({ memo: null, reason: 'Defective product' }),
    )
    expect(result.note).toBe('Defective product')
  })

  it('prefers memo over reason', () => {
    const result = transformRefund(
      makeReturnAuth({ memo: 'Manual note', reason: 'Defective product' }),
    )
    expect(result.note).toBe('Manual note')
  })

  it('defaults currency to USD', () => {
    const result = transformRefund(makeReturnAuth({ currency: undefined }))
    expect(result.amount?.currency).toBe('USD')
  })

  it('preserves metadata', () => {
    const raw = makeReturnAuth()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies RefundSchema', () => {
    const result = transformRefund(makeReturnAuth())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeReturnAuth())
    const body = untransformRefund(canonical) as { return_authorization: Record<string, unknown> }
    expect(body.return_authorization['order_id']).toBe(500)
    expect(body.return_authorization['memo']).toBe('Customer returned defective item')
  })
})
