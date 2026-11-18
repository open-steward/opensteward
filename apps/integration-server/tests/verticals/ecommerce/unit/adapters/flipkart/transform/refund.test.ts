import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawFlipkartReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/flipkart/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturn(overrides: Partial<RawFlipkartReturn> = {}): RawFlipkartReturn {
  return {
    return_id: 'RTN-FK-001',
    order_id: 'OD-FK-1234567890',
    order_item_id: 'OI-FK-001',
    sku_id: 'SKU-POLO-BLU-M',
    listing_id: 'LSTSHRT001',
    quantity: 1,
    reason: 'Product damaged',
    sub_reason: 'Torn packaging',
    return_type: 'RETURN',
    status: 'APPROVED',
    refund_amount: {
      amount: 699,
      currency_code: 'INR',
    },
    created_at: '2024-06-10T08:00:00Z',
    updated_at: '2024-06-11T12:00:00Z',
    ...overrides,
  }
}

describe('transformRefund (Flipkart)', () => {
  it('uses the return_id as the canonical refund id', () => {
    const r = transformRefund(makeReturn())
    expect(r.id).toBe('RTN-FK-001')
    expect(r.orderId).toBe('OD-FK-1234567890')
    expect(r.processedAt).toBe('2024-06-11T12:00:00Z')
    expect(r.createdAt).toBe('2024-06-10T08:00:00Z')
  })

  it('maps refund amount correctly', () => {
    const r = transformRefund(makeReturn())
    expect(r.amount).toEqual({ amount: 699, currency: 'INR' })
  })

  it('combines reason and sub_reason into canonical reason', () => {
    const r = transformRefund(makeReturn())
    expect(r.reason).toBe('Product damaged — Torn packaging')
  })

  it('uses only reason when sub_reason is absent', () => {
    const r = transformRefund(makeReturn({ sub_reason: undefined }))
    expect(r.reason).toBe('Product damaged')
  })

  it('returns undefined reason when both are absent', () => {
    const r = transformRefund(makeReturn({ reason: undefined, sub_reason: undefined }))
    expect(r.reason).toBeUndefined()
  })

  it('maps refund line items with the order_item_id', () => {
    const r = transformRefund(makeReturn())
    expect(r.refundLineItems).toHaveLength(1)
    expect(r.refundLineItems![0]!.lineItemId).toBe('OI-FK-001')
    expect(r.refundLineItems![0]!.quantity).toBe(1)
    expect(r.refundLineItems![0]!.amount).toEqual({ amount: 699, currency: 'INR' })
  })

  it('handles missing refund_amount gracefully', () => {
    const r = transformRefund(makeReturn({ refund_amount: undefined }))
    expect(r.amount).toBeUndefined()
    expect(r.refundLineItems![0]!.amount).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeReturn()
    const r = transformRefund(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const r = transformRefund(makeReturn())
    expect(() => RefundSchema.parse(r)).not.toThrow()
  })
})
