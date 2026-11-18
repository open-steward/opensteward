import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawEbayRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/ebay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawEbayRefund> = {}): RawEbayRefund {
  return {
    orderId: '04-12345-67890',
    refundAmount: { value: '24.99', currency: 'USD' },
    reasonForRefund: 'ITEM_NOT_AS_DESCRIBED',
    comment: 'Buyer reported wrong colour.',
    refundDate: '2024-05-15T09:00:00.000Z',
    refundId: 'REF-001',
    refundStatus: 'REFUNDED',
    ...overrides,
  }
}

describe('transformRefund (eBay)', () => {
  it('maps refund id and orderId correctly', () => {
    const r = transformRefund(makeRefund())
    expect(r.id).toBe('REF-001')
    expect(r.orderId).toBe('04-12345-67890')
    expect(r.processedAt).toBe('2024-05-15T09:00:00.000Z')
  })

  it('parses string amount into numeric money', () => {
    const r = transformRefund(makeRefund())
    expect(r.amount).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('uses composite id when no refundId is provided', () => {
    const r = transformRefund(makeRefund({ refundId: undefined }))
    expect(r.id).toBe('04-12345-67890:refund')
  })

  it('maps reason and note', () => {
    const r = transformRefund(makeRefund())
    expect(r.reason).toBe('ITEM_NOT_AS_DESCRIBED')
    expect(r.note).toBe('Buyer reported wrong colour.')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const r = transformRefund(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const r = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(r)).not.toThrow()
  })

  it('round-trips via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const body = untransformRefund(canonical)
    expect(body['reasonForRefund']).toBe('ITEM_NOT_AS_DESCRIBED')
    const amount = body['orderLevelRefundAmount'] as { value: string; currency: string }
    expect(amount.value).toBe('24.99')
    expect(amount.currency).toBe('USD')
  })
})
