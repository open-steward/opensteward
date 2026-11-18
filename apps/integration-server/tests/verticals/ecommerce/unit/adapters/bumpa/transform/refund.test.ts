import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawBumpaRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/bumpa/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

describe('transformRefund (bumpa)', () => {
  const raw: RawBumpaRefund = {
    id: 800,
    order_id: 9001,
    amount: '15000.00',
    currency: 'NGN',
    reason: 'Item not as described',
    note: 'Customer requested full refund',
    restock: true,
    refund_items: [{ line_item_id: 500, quantity: 1, subtotal: '15000.00' }],
    processed_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformRefund(raw).id).toBe('800')
  })

  it('maps orderId to string', () => {
    expect(transformRefund(raw).orderId).toBe('9001')
  })

  it('converts amount to minor units (NGN)', () => {
    // 15000.00 NGN → 1500000 kobo
    const result = transformRefund(raw)
    expect(result.amount?.amount).toBe(1500000)
    expect(result.amount?.currency).toBe('NGN')
  })

  it('maps reason', () => {
    expect(transformRefund(raw).reason).toBe('Item not as described')
  })

  it('maps note', () => {
    expect(transformRefund(raw).note).toBe('Customer requested full refund')
  })

  it('maps restock', () => {
    expect(transformRefund(raw).restock).toBe(true)
  })

  it('maps refund line items with minor-unit amount', () => {
    const result = transformRefund(raw)
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('500')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    // 15000.00 NGN → 1500000 kobo
    expect(result.refundLineItems![0]!.amount?.amount).toBe(1500000)
  })

  it('maps processedAt', () => {
    expect(transformRefund(raw).processedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('uses total as fallback for amount', () => {
    const result = transformRefund({ ...raw, amount: undefined, total: '5000.00' })
    expect(result.amount?.amount).toBe(500000)
  })

  it('uses line_items as fallback for refund_items', () => {
    const result = transformRefund({
      ...raw,
      refund_items: undefined,
      line_items: [{ order_item_id: 999, quantity: 2 }],
    })
    expect(result.refundLineItems![0]!.lineItemId).toBe('999')
  })

  it('passes RefundSchema validation', () => {
    expect(() => RefundSchema.parse(transformRefund(raw))).not.toThrow()
  })
})

describe('untransformRefund (bumpa)', () => {
  it('round-trips reason and restock', () => {
    const body = untransformRefund({ reason: 'defective', restock: true })
    expect(body.reason).toBe('defective')
    expect(body.restock).toBe(true)
  })
})
