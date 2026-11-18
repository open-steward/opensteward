import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWooCommerceRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/ankorstore/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawWooCommerceRefund> = {}): RawWooCommerceRefund {
  return {
    id: 77,
    parent_id: 1001,
    amount: '25.00',
    reason: 'Defective product',
    currency: 'USD',
    line_items: [
      {
        id: 10,
        quantity: -1,
        total: '-25.00',
      },
    ],
    date_created_gmt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (Ankorstore / WooCommerce)', () => {
  it('maps id to string', () => {
    const result = transformRefund(makeRefund({ id: 99 }), 'order-1001')
    expect(result.id).toBe('99')
  })

  it('maps orderId', () => {
    const result = transformRefund(makeRefund(), 'order-1001')
    expect(result.orderId).toBe('order-1001')
  })

  it('converts amount to minor units', () => {
    const result = transformRefund(makeRefund({ amount: '25.00' }), 'o1', 'USD')
    expect(result.amount?.amount).toBe(2500)
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps reason', () => {
    const result = transformRefund(makeRefund(), 'o1')
    expect(result.reason).toBe('Defective product')
  })

  it('hardcodes restock to false', () => {
    const result = transformRefund(makeRefund(), 'o1')
    expect(result.restock).toBe(false)
  })

  it('maps refundLineItems with abs quantity', () => {
    const result = transformRefund(makeRefund(), 'o1', 'USD')
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('10')
  })

  it('converts line item total to minor units', () => {
    const result = transformRefund(makeRefund(), 'o1', 'USD')
    expect(result.refundLineItems![0]!.amount?.amount).toBe(2500)
  })

  it('maps processedAt from date_created_gmt', () => {
    const result = transformRefund(makeRefund(), 'o1')
    expect(result.processedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw, 'o1')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeRefund(), 'order-1001', 'USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (Ankorstore / WooCommerce)', () => {
  it('maps reason', () => {
    const body = untransformRefund({ reason: 'Wrong item' })
    expect(body.reason).toBe('Wrong item')
  })

  it('converts minor-unit amount to major-unit decimal string', () => {
    const body = untransformRefund({ amount: { amount: 1000, currency: 'USD' } })
    expect(body.amount).toBe('10')
  })

  it('maps refundLineItems', () => {
    const body = untransformRefund({
      refundLineItems: [{ lineItemId: '5', quantity: 2 }],
    })
    const items = body.line_items as Array<Record<string, unknown>>
    expect(items[0]!.id).toBe('5')
    expect(items[0]!.quantity).toBe(2)
  })
})
