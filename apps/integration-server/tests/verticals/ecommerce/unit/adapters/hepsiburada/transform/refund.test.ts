import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWooCommerceRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/hepsiburada/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRaw(overrides: Partial<RawWooCommerceRefund> = {}): RawWooCommerceRefund {
  return {
    id: 901,
    parent_id: 6001,
    amount: '249.99',
    reason: 'Ürün beklentileri karşılamadı',
    refunded_by: 1,
    refunded_payment: true,
    line_items: [
      {
        id: 1001,
        quantity: -1,
        total: '-249.99',
      },
    ],
    date_created: '2024-03-01T00:00:00Z',
    date_created_gmt: '2024-03-01T00:00:00Z',
    currency: 'TRY',
    ...overrides,
  }
}

describe('transformRefund (hepsiburada / WooCommerce)', () => {
  it('maps id and orderId from parent_id', () => {
    const result = transformRefund(makeRaw(), '6001')
    expect(result.id).toBe('901')
    expect(result.orderId).toBe('6001')
  })

  it('maps amount from top-level amount field in minor units', () => {
    const result = transformRefund(makeRaw(), '6001')
    // 249.99 TRY — majorToMinor for TRY is 1:100 → 24999
    expect(result.amount).toBeDefined()
    expect(result.amount!.currency).toBe('TRY')
    expect(result.amount!.amount).toBe(24999)
  })

  it('maps reason', () => {
    const result = transformRefund(makeRaw(), '6001')
    expect(result.reason).toBe('Ürün beklentileri karşılamadı')
  })

  it('hardcodes restock to false (WC has no restock field)', () => {
    const result = transformRefund(makeRaw(), '6001')
    expect(result.restock).toBe(false)
  })

  it('maps line items with absolute quantity', () => {
    const result = transformRefund(makeRaw(), '6001')
    // WC line_items quantity is negative — transform takes abs()
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.quantity).toBe(1)
  })

  it('maps processedAt from date_created_gmt', () => {
    const result = transformRefund(makeRaw(), '6001')
    expect(result.processedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('produces a payload that satisfies RefundSchema', () => {
    expect(() => RefundSchema.parse(transformRefund(makeRaw(), '6001'))).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const body = untransformRefund(transformRefund(makeRaw(), '6001'))
    expect(body['reason']).toBe('Ürün beklentileri karşılamadı')
    // amount is converted back to major-unit decimal
    expect(body['amount']).toBe('249.99')
  })
})
