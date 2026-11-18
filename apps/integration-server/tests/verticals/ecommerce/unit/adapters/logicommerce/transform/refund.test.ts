import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawShopifyRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/logicommerce/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawShopifyRefund> = {}): RawShopifyRefund {
  return {
    id: 9001,
    order_id: 4001,
    note: 'Defective product',
    restock: true,
    refund_line_items: [{ line_item_id: 21, quantity: 1, subtotal: '49.99', total_tax: '4.00' }],
    transactions: [{ id: 8001 }],
    processed_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformRefund (logicommerce / Shopify)', () => {
  it('maps id to string', () => {
    const result = transformRefund(makeRefund({ id: 42 }))
    expect(result.id).toBe('42')
  })

  it('maps order_id to orderId', () => {
    const result = transformRefund(makeRefund())
    expect(result.orderId).toBe('4001')
  })

  it('computes total amount from line items in minor units', () => {
    // 49.99 EUR → 4999 cents
    const result = transformRefund(makeRefund())
    expect(result.amount?.amount).toBe(4999)
    expect(result.amount?.currency).toBe('EUR')
  })

  it('maps restock', () => {
    const result = transformRefund(makeRefund({ restock: false }))
    expect(result.restock).toBe(false)
  })

  it('maps refund_line_items', () => {
    const result = transformRefund(makeRefund())
    expect(result.refundLineItems?.[0]?.lineItemId).toBe('21')
    expect(result.refundLineItems?.[0]?.quantity).toBe(1)
  })

  it('maps transaction ids', () => {
    const result = transformRefund(makeRefund())
    expect(result.transactionIds).toEqual(['8001'])
  })

  it('stores raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund (logicommerce / Shopify)', () => {
  it('maps note and restock', () => {
    const body = untransformRefund({ note: 'Broken', restock: true })
    expect(body.note).toBe('Broken')
    expect(body.restock).toBe(true)
  })

  it('round-trips note and restock', () => {
    const canonical = transformRefund(makeRefund())
    const body = untransformRefund(canonical)
    expect(body.note).toBe('Defective product')
    expect(body.restock).toBe(true)
  })
})
