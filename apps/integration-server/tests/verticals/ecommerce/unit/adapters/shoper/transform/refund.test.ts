import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShoperOrderReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoper/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawShoperOrderReturn> = {}): RawShoperOrderReturn {
  return {
    return_id: 401,
    order_id: 20001,
    amount: '49.99',
    currency: 'PLN',
    reason: 'Damaged in transit',
    note: 'Customer requested full refund',
    restock: 1,
    add_date: '2024-04-01T10:00:00.000Z',
    edit_date: '2024-04-02T08:00:00.000Z',
    ...overrides,
  }
}

describe('shoper transformRefund', () => {
  it('maps return_id to string id and order_id to orderId', () => {
    const result = transformRefund(makeRaw())
    expect(result.id).toBe('401')
    expect(result.orderId).toBe('20001')
  })

  it('converts amount to minor units (PLN: ×100)', () => {
    // 49.99 PLN = 4999 gr
    const result = transformRefund(makeRaw())
    expect(result.amount?.amount).toBe(4999)
    expect(result.amount?.currency).toBe('PLN')
  })

  it('maps reason and note', () => {
    const result = transformRefund(makeRaw())
    expect(result.reason).toBe('Damaged in transit')
    expect(result.note).toBe('Customer requested full refund')
  })

  it('converts restock 1 to boolean true', () => {
    const result = transformRefund(makeRaw())
    expect(result.restock).toBe(true)
  })

  it('uses fallbackOrderId when order_id is absent', () => {
    const result = transformRefund(makeRaw({ order_id: null }), 'fallback-order-99')
    expect(result.orderId).toBe('fallback-order-99')
  })

  it('produces output that passes RefundSchema', () => {
    const result = transformRefund(makeRaw())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRaw())
    const back = untransformRefund(canonical)
    expect(back.reason).toBe('Damaged in transit')
    expect(back.restock).toBe(1)
  })
})
