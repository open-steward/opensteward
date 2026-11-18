import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawSnipcartRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/snipcart/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawSnipcartRefund> = {}): RawSnipcartRefund {
  return {
    id: 'refund-guid-abc',
    orderToken: 'order-token-xyz',
    amount: 19.99,
    comment: 'Customer returned item.',
    refundedByPaymentGateway: true,
    ...overrides,
  }
}

describe('transformRefund (Snipcart)', () => {
  it('maps id and orderToken to id/orderId', () => {
    const result = transformRefund(makeRefund(), 'order-token-xyz')
    expect(result.id).toBe('refund-guid-abc')
    expect(result.orderId).toBe('order-token-xyz')
  })

  it('converts major-unit amount to minor units with provided currency', () => {
    const result = transformRefund(makeRefund(), 'order-token-xyz', 'USD')
    // 19.99 × 100 → 1999 cents
    expect(result.amount).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('maps comment to note', () => {
    const result = transformRefund(makeRefund(), 'order-token-xyz')
    expect(result.note).toBe('Customer returned item.')
  })

  it('omits amount when raw.amount is null', () => {
    const result = transformRefund(makeRefund({ amount: null }), 'order-token-xyz')
    expect(result.amount).toBeUndefined()
  })

  it('omits amount when raw.amount is 0', () => {
    const result = transformRefund(makeRefund({ amount: 0 }), 'order-token-xyz')
    expect(result.amount).toBeUndefined()
  })

  it('defaults currency to USD when not provided', () => {
    const result = transformRefund(makeRefund(), 'order-token-xyz')
    expect(result.amount?.currency).toBe('USD')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    expect(transformRefund(raw, 'order-token-xyz').metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    expect(() =>
      RefundSchema.parse(transformRefund(makeRefund(), 'order-token-xyz')),
    ).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRefund(), 'order-token-xyz', 'USD')
    const body = untransformRefund(canonical, 'USD')
    // 1999 cents → 19.99 major units
    expect(body['amount']).toBeCloseTo(19.99, 2)
    expect(body['comment']).toBe('Customer returned item.')
  })
})
