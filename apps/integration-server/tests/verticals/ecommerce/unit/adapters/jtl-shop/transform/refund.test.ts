import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawJtlShopRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/jtl-shop/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

describe('transformRefund (jtl-shop)', () => {
  const raw: RawJtlShopRefund = {
    id: 888,
    orderId: 5000,
    amount: 79.99,
    currency: 'EUR',
    reason: 'Wrong size',
    note: 'Customer requested full refund',
    restock: true,
    items: [{ lineItemId: 101, quantity: 1, amount: 79.99 }],
    created: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformRefund(raw, '5000')
    expect(result.id).toBe('888')
  })

  it('maps orderId from raw.orderId when present', () => {
    const result = transformRefund(raw, '5000')
    expect(result.orderId).toBe('5000')
  })

  it('falls back to provided orderId argument when raw.orderId is null', () => {
    const result = transformRefund({ ...raw, orderId: null }, 'fallback-order')
    expect(result.orderId).toBe('fallback-order')
  })

  it('converts amount to minor units (EUR × 100)', () => {
    const result = transformRefund(raw, '5000')
    // 79.99 EUR → 7999 cents
    expect(result.amount).toEqual({ amount: 7999, currency: 'EUR' })
  })

  it('maps reason and note', () => {
    const result = transformRefund(raw, '5000')
    expect(result.reason).toBe('Wrong size')
    expect(result.note).toBe('Customer requested full refund')
  })

  it('maps restock flag', () => {
    const result = transformRefund(raw, '5000')
    expect(result.restock).toBe(true)
  })

  it('maps refundLineItems with string ids and minor-unit amounts', () => {
    const result = transformRefund(raw, '5000')
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('101')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    // 79.99 → 7999
    expect(result.refundLineItems![0]!.amount).toEqual({ amount: 7999, currency: 'EUR' })
  })

  it('maps createdAt from created', () => {
    const result = transformRefund(raw, '5000')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('omits amount when raw amount is 0 or null', () => {
    const result = transformRefund({ ...raw, amount: 0 }, '5000')
    expect(result.amount).toBeUndefined()
  })

  it('produces schema-valid output', () => {
    const result = transformRefund(raw, '5000')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const result = transformRefund(raw, '5000')
    const back = untransformRefund(result)
    expect(back.reason).toBe(raw.reason)
    expect(back.note).toBe(raw.note)
    expect(back.restock).toBe(true)
  })
})
