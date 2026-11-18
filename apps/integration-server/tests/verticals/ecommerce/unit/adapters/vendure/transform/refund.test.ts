import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawVendureRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/vendure/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawVendureRefund> = {}): RawVendureRefund {
  return {
    id: 'ORD1:PAY1:REF1',
    orderId: 'ORD1',
    total: 2500, // $25.00 in cents
    reason: 'Defective item',
    state: 'Settled',
    paymentId: 'PAY1',
    createdAt: '2024-05-10T14:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (Vendure)', () => {
  it('maps core fields with cents conversion', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('ORD1:PAY1:REF1')
    expect(result.orderId).toBe('ORD1')
    expect(result.amount).toEqual({ amount: 2500, currency: 'USD' })
    expect(result.reason).toBe('Defective item')
  })

  it('maps transaction ids from paymentId', () => {
    const result = transformRefund(makeRefund())
    expect(result.transactionIds).toEqual(['PAY1'])
  })

  it('handles missing total', () => {
    const result = transformRefund(makeRefund({ total: undefined }))
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
    // Amount should be back in cents
    expect(raw['amount']).toBe(2500)
    expect(raw['reason']).toBe('Defective item')
  })
})
