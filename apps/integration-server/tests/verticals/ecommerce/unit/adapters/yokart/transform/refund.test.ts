import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawYokartRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/yokart/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawYokartRefund> = {}): RawYokartRefund {
  return {
    refund_id: 77,
    order_id: 1042,
    refund_amount: '29.99',
    refund_reason: 'Defective item',
    refund_note: 'Customer requested replacement',
    refund_status: '1',
    refund_date: '2024-06-01T10:00:00Z',
    refund_currency: 'USD',
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeRefund(), '1042')
    expect(result.id).toBe('77')
    expect(result.orderId).toBe('1042')
    expect(result.reason).toBe('Defective item')
    expect(result.note).toBe('Customer requested replacement')
  })

  it('converts refund_amount from major to minor units', () => {
    const result = transformRefund(makeRefund(), '1042')
    expect(result.amount).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('uses Math.abs so negative amounts work correctly', () => {
    const result = transformRefund(makeRefund({ refund_amount: '-29.99' }), '1042')
    expect(result.amount?.amount).toBe(2999)
  })

  it('orderId parameter takes precedence over raw.order_id', () => {
    const result = transformRefund(makeRefund(), 'ord-override')
    expect(result.orderId).toBe('ord-override')
  })

  it('uses refund_currency from raw when present', () => {
    const result = transformRefund(makeRefund({ refund_currency: 'EUR' }), '1042')
    expect(result.amount?.currency).toBe('EUR')
  })

  it('falls back to currency param when refund_currency absent', () => {
    const result = transformRefund(makeRefund({ refund_currency: undefined }), '1042', 'GBP')
    expect(result.amount?.currency).toBe('GBP')
  })

  it('defaults currency param to USD', () => {
    const result = transformRefund(makeRefund({ refund_currency: undefined }), '1042')
    expect(result.amount?.currency).toBe('USD')
  })

  it('sets restock to false (no native restock in Yo!Kart)', () => {
    const result = transformRefund(makeRefund(), '1042')
    expect(result.restock).toBe(false)
  })

  it('maps refund_date to processedAt and createdAt', () => {
    const result = transformRefund(makeRefund(), '1042')
    expect(result.processedAt).toBeTruthy()
    expect(result.createdAt).toBeTruthy()
  })

  it('handles null refund_amount gracefully (no amount field)', () => {
    const result = transformRefund(makeRefund({ refund_amount: null }), '1042')
    expect(result.amount).toBeUndefined()
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefund(), '1042')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformRefund', () => {
    const canonical = transformRefund(makeRefund(), '1042')
    const raw = untransformRefund(canonical)
    expect(raw['order_id']).toBe('1042')
    expect(raw['refund_reason']).toBe('Defective item')
    expect(raw['refund_note']).toBe('Customer requested replacement')
  })

  it('untransformRefund converts amount back to major units', () => {
    const canonical = transformRefund(makeRefund(), '1042')
    const raw = untransformRefund(canonical)
    // 2999 minor → '29.99' major
    expect(parseFloat(raw['refund_amount'] as string)).toBe(29.99)
  })
})
