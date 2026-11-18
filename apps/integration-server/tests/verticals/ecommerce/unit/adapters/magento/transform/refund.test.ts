import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawMagentoCreditMemo,
} from '../../../../../../../src/verticals/ecommerce/adapters/magento/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeCreditMemo(
  overrides: Partial<RawMagentoCreditMemo> = {},
): RawMagentoCreditMemo {
  return {
    entity_id: 6001,
    order_id: 1001,
    increment_id: '000000789',
    state: 2,
    subtotal: 49.99,
    grand_total: 53.99,
    base_grand_total: 53.99,
    base_currency_code: 'USD',
    order_currency_code: 'USD',
    shipping_amount: 0,
    tax_amount: 4.0,
    discount_amount: 0,
    adjustment: 0,
    adjustment_positive: 0,
    adjustment_negative: 0,
    items: [
      {
        entity_id: 7001,
        order_item_id: 9001,
        qty: 1,
        sku: 'TEE-OCEAN-BLUE-S',
        name: 'Ocean Blue Tee',
        price: 49.99,
        row_total: 49.99,
      },
    ],
    comments: [
      { comment: 'Customer returned one tee', is_customer_notified: 1 },
    ],
    created_at: '2024-05-10T10:00:00.000Z',
    updated_at: '2024-05-10T10:00:00.000Z',
    ...overrides,
  }
}

describe('transformRefund (Magento)', () => {
  it('maps canonical fields including amount and currency', () => {
    const result = transformRefund(makeCreditMemo())
    expect(result.id).toBe('6001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.amount).toEqual({ amount: 5399, currency: 'USD' })
    expect(result.note).toBe('Customer returned one tee')
    expect(result.restock).toBe(false)
  })

  it('maps refund line items by order_item_id', () => {
    const result = transformRefund(makeCreditMemo())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]).toEqual({
      lineItemId: '9001',
      quantity: 1,
      amount: { amount: 4999, currency: 'USD' },
    })
  })

  it('falls back to base_grand_total when grand_total is absent', () => {
    const result = transformRefund(
      makeCreditMemo({ grand_total: undefined, base_grand_total: 50 }),
    )
    expect(result.amount?.amount).toBe(5000)
  })

  it('preserves raw payload in metadata unmodified', () => {
    const raw = makeCreditMemo()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeCreditMemo())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformRefund', () => {
    const canonical = transformRefund(makeCreditMemo())
    const body = untransformRefund(canonical)
    const items = body['items'] as Array<{ order_item_id: number; qty: number }>
    expect(items[0]!.order_item_id).toBe(9001)
    expect(items[0]!.qty).toBe(1)
  })
})
