import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawSaleorRefundEvent,
} from '../../../../../../../src/verticals/ecommerce/adapters/saleor/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawSaleorRefundEvent> = {}): RawSaleorRefundEvent {
  return {
    id: 'ORD1:PAY1:0',
    orderId: 'ORD1',
    amount: { amount: 25.0, currency: 'USD' },
    type: 'REFUND',
    createdAt: '2024-06-01T10:00:00Z',
    transactionId: 'PAY1',
    ...overrides,
  }
}

describe('transformRefund (Saleor)', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('ORD1:PAY1:0')
    expect(result.orderId).toBe('ORD1')
    expect(result.amount).toEqual({ amount: 2500, currency: 'USD' })
    expect(result.transactionIds).toEqual(['PAY1'])
  })

  it('maps reason from message', () => {
    const result = transformRefund(makeRefund({ message: 'Defective item' }))
    expect(result.reason).toBe('Defective item')
  })

  it('handles missing amount', () => {
    const result = transformRefund(makeRefund({ amount: null }))
    expect(result.amount).toBeUndefined()
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

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const raw = untransformRefund(canonical)
    expect(raw['amount']).toBe(25.0)
  })
})
