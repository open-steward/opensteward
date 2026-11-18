import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawFacebookRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/facebook-shop/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawFacebookRefund> = {}): RawFacebookRefund {
  return {
    id: 'REF-001',
    order_id: 'FB-ORD-12345',
    refund_amount: { amount: '29.99', currency: 'USD' },
    refund_reason: 'WRONG_ITEM',
    reason_text: 'Customer received the wrong item.',
    created_at: '2024-06-20T14:00:00.000Z',
    ...overrides,
  }
}

describe('transformRefund (Facebook Shop)', () => {
  it('maps refund id and orderId correctly', () => {
    const r = transformRefund(makeRefund())
    expect(r.id).toBe('REF-001')
    expect(r.orderId).toBe('FB-ORD-12345')
    expect(r.processedAt).toBe('2024-06-20T14:00:00.000Z')
  })

  it('parses string amount into numeric money', () => {
    const r = transformRefund(makeRefund())
    expect(r.amount).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps reason and note', () => {
    const r = transformRefund(makeRefund())
    expect(r.reason).toBe('WRONG_ITEM')
    expect(r.note).toBe('Customer received the wrong item.')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const r = transformRefund(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const r = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(r)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const body = untransformRefund(canonical)
    expect(body['reason_code']).toBe('WRONG_ITEM')
    expect(body['reason_text']).toBe('Customer received the wrong item.')
    const amount = body['refund_amount'] as { amount: string; currency: string }
    expect(amount.amount).toBe('29.99')
    expect(amount.currency).toBe('USD')
  })

  it('handles missing refund amount gracefully', () => {
    const r = transformRefund(makeRefund({ refund_amount: undefined }))
    expect(r.amount).toBeUndefined()
  })

  it('handles NaN amount gracefully', () => {
    const r = transformRefund(makeRefund({ refund_amount: { amount: 'invalid', currency: 'USD' } }))
    expect(r.amount).toBeUndefined()
  })
})
