import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPddRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/pinduoduo/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRefund(overrides: Partial<RawPddRefund> = {}): RawPddRefund {
  return {
    refund_id: 'RF20240101000001',
    order_sn: 'PDD2024010100000001',
    refund_amount: 8900, // 89.00 CNY
    refund_reason: '七天无理由退货',
    after_sales_status: 4,
    created_time: 1704067200, // 2024-01-01T00:00:00Z
    updated_time: 1704070800, // 2024-01-01T01:00:00Z
    success_time: 1704074400, // 2024-01-01T02:00:00Z
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('transformRefund (Pinduoduo)', () => {
  it('uses refund_id as canonical id and order_sn as orderId', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('RF20240101000001')
    expect(result.orderId).toBe('PDD2024010100000001')
  })

  it('reports refund_amount in fen, the minor unit Money.amount requires', () => {
    const result = transformRefund(makeRefund())
    expect(result.amount).toEqual({ amount: 8900, currency: 'CNY' })
  })

  it('omits amount when refund_amount is absent', () => {
    const result = transformRefund(makeRefund({ refund_amount: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('maps refund_reason to reason', () => {
    const result = transformRefund(makeRefund())
    expect(result.reason).toBe('七天无理由退货')
  })

  it('prefers success_time for processedAt, falling back to updated_time', () => {
    const withSuccess = transformRefund(makeRefund())
    expect(withSuccess.processedAt).toBe('2024-01-01T02:00:00.000Z')

    const withoutSuccess = transformRefund(makeRefund({ success_time: undefined }))
    expect(withoutSuccess.processedAt).toBe('2024-01-01T01:00:00.000Z')
  })

  it('converts created_time to createdAt', () => {
    const result = transformRefund(makeRefund())
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  it('stores the complete raw record in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('falls back to empty-string id/orderId when identifiers are absent', () => {
    const result = transformRefund(makeRefund({ refund_id: undefined, order_sn: undefined }))
    expect(result.id).toBe('')
    expect(result.orderId).toBe('')
  })

  it('round-trips through RefundSchema.parse', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
    const parsed = RefundSchema.parse(result)
    expect(parsed.id).toBe('RF20240101000001')
    expect(parsed.orderId).toBe('PDD2024010100000001')
  })

  it('round-trips a minimal raw record through RefundSchema.parse', () => {
    const result = transformRefund({})
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
