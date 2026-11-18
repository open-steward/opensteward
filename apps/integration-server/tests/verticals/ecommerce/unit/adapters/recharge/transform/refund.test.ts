import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawRechargeRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/recharge/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawRechargeRefund> = {}): RawRechargeRefund {
  return {
    id: 600,
    order_id: 5001,
    total_refunds: '19.99',
    currency: 'USD',
    note: 'Customer requested refund',
    status: 'refunded',
    created_at: '2024-06-01T00:00:00Z',
    updated_at: '2024-06-01T01:00:00Z',
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('maps id and orderId', () => {
    const result = transformRefund(makeRefund(), '5001')
    expect(result.id).toBe('600')
    expect(result.orderId).toBe('5001')
  })

  it('converts total_refunds to minor units', () => {
    const result = transformRefund(makeRefund(), '5001')
    expect(result.amount).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('maps reason from note', () => {
    const result = transformRefund(makeRefund(), '5001')
    expect(result.reason).toBe('Customer requested refund')
  })

  it('omits amount when total_refunds is zero', () => {
    const result = transformRefund(makeRefund({ total_refunds: '0' }), '5001')
    expect(result.amount).toBeUndefined()
  })

  it('restock is always false (Recharge manages no inventory)', () => {
    const result = transformRefund(makeRefund(), '5001')
    expect(result.restock).toBe(false)
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
})
