import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawMedusaRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/medusa/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawMedusaRefund> = {}): RawMedusaRefund {
  return {
    id: 'ref_01',
    order_id: 'order_01',
    amount: 2500,
    reason: 'damaged',
    note: 'Item arrived damaged',
    payment_id: 'pay_01',
    created_at: '2024-05-03T10:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (Medusa v2)', () => {
  it('maps core fields and converts amount from cents', () => {
    const result = transformRefund(makeRefund(), 'order_01')
    expect(result.id).toBe('ref_01')
    expect(result.orderId).toBe('order_01')
    expect(result.amount).toEqual({ amount: 2500, currency: 'USD' })
    expect(result.reason).toBe('damaged')
    expect(result.note).toBe('Item arrived damaged')
    expect(result.transactionIds).toEqual(['pay_01'])
  })

  it('handles refund without amount', () => {
    const result = transformRefund(makeRefund({ amount: undefined }), 'order_01')
    expect(result.amount).toBeUndefined()
  })

  it('handles refund without payment_id', () => {
    const result = transformRefund(makeRefund({ payment_id: null }), 'order_01')
    expect(result.transactionIds).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw, 'order_01')
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformRefund(makeRefund(), 'order_01')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('untransforms amount back to cents', () => {
    const body = untransformRefund({
      amount: { amount: 2550, currency: 'USD' },
      reason: 'customer_request',
    })
    expect(body['amount']).toBe(2550)
    expect(body['reason']).toBe('customer_request')
  })
})
