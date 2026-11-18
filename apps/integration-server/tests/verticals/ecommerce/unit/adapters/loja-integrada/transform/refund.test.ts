import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShopifyRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawShopifyRefund> = {}): RawShopifyRefund {
  return {
    id: 8001,
    order_id: 5001,
    currency: 'BRL',
    note: 'Cliente solicitou reembolso.',
    restock: true,
    refund_line_items: [
      { line_item_id: 111, quantity: 1, subtotal: '89.95', total_tax: '9.00' },
      { line_item_id: 112, quantity: 2, subtotal: '50.00', total_tax: '5.00' },
    ],
    transactions: [{ id: 9001 }, { id: 9002 }],
    processed_at: '2024-03-05T14:00:00Z',
    created_at: '2024-03-05T13:55:00Z',
    ...overrides,
  }
}

describe('transformRefund (loja-integrada / Shopify)', () => {
  it('maps id and orderId', () => {
    const result = transformRefund(makeRaw())
    expect(result.id).toBe('8001')
    expect(result.orderId).toBe('5001')
  })

  it('computes total amount as sum of refund_line_items subtotals in minor units', () => {
    // 89.95 + 50.00 = 139.95 BRL → 13995 cents
    const result = transformRefund(makeRaw())
    expect(result.amount).toEqual({ amount: 13995, currency: 'BRL' })
  })

  it('maps note and restock', () => {
    const result = transformRefund(makeRaw())
    expect(result.note).toBe('Cliente solicitou reembolso.')
    expect(result.restock).toBe(true)
  })

  it('maps refundLineItems with amounts in minor units', () => {
    const result = transformRefund(makeRaw())
    expect(result.refundLineItems).toHaveLength(2)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('111')
    expect(li.quantity).toBe(1)
    expect(li.amount).toEqual({ amount: 8995, currency: 'BRL' })
  })

  it('maps transactionIds', () => {
    const result = transformRefund(makeRaw())
    expect(result.transactionIds).toEqual(['9001', '9002'])
  })

  it('maps processedAt and createdAt', () => {
    const result = transformRefund(makeRaw())
    expect(result.processedAt).toBe('2024-03-05T14:00:00Z')
    expect(result.createdAt).toBe('2024-03-05T13:55:00Z')
  })

  it('returns undefined amount when no refund_line_items', () => {
    const result = transformRefund(makeRaw({ refund_line_items: [] }))
    expect(result.amount).toBeUndefined()
    expect(result.refundLineItems).toBeUndefined()
  })

  it('uses fallback currency parameter when raw currency is absent', () => {
    const raw = makeRaw({ currency: undefined })
    const result = transformRefund(raw, 'USD')
    // 89.95 + 50.00 = 139.95 USD → 13995 cents
    expect(result.amount?.currency).toBe('USD')
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRaw())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (loja-integrada / Shopify)', () => {
  it('maps canonical fields back to Shopify body keys', () => {
    const result = untransformRefund({
      note: 'Reembolso aprovado.',
      restock: true,
      refundLineItems: [{ lineItemId: '111', quantity: 1 }],
    })
    expect(result.note).toBe('Reembolso aprovado.')
    expect(result.restock).toBe(true)
    expect(result.refund_line_items).toEqual([{ line_item_id: '111', quantity: 1 }])
    expect(result.notify).toBe(false)
  })
})
