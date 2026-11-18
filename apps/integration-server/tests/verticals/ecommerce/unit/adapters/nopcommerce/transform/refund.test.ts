import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawNopRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/nopcommerce/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawNopRefund> = {}): RawNopRefund {
  return {
    id: 9001,
    order_id: 5001,
    amount: 24.99,
    reason: 'Defective item',
    refunded_on_utc: '2024-03-10T15:00:00Z',
    currency: 'USD',
    ...overrides,
  }
}

describe('transformRefund (nopCommerce)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund(), '5001')
    expect(result.id).toBe('9001')
    expect(result.orderId).toBe('5001')
    expect(result.amount).toEqual({ amount: 2499, currency: 'USD' })
    expect(result.reason).toBe('Defective item')
    expect(result.restock).toBe(false)
    expect(result.processedAt).toBe('2024-03-10T15:00:00Z')
  })

  it('handles missing amount', () => {
    const result = transformRefund(makeRefund({ amount: undefined }), '5001')
    expect(result.amount).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw, '5001')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefund(), '5001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformRefund', () => {
    const canonical = transformRefund(makeRefund(), '5001')
    const body = untransformRefund(canonical)
    expect(body['amount']).toBe(24.99)
    expect(body['reason']).toBe('Defective item')
  })
})
