import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawLsRefund,
  type RawLsRefundAttributes,
} from '../../../../../../../src/verticals/ecommerce/adapters/lemon-squeezy/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeAttrs(overrides: Partial<RawLsRefundAttributes> = {}): RawLsRefundAttributes {
  return {
    order_id: 100,
    store_id: 1,
    total: 4999,
    currency: 'USD',
    refunded_at: '2024-03-01T00:00:00Z',
    reason: 'No longer needed',
    identifier: 'ref-uuid-abc',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeRaw(attrsOverrides: Partial<RawLsRefundAttributes> = {}): RawLsRefund {
  return {
    id: 'ref-55',
    type: 'refunds',
    attributes: makeAttrs(attrsOverrides),
  }
}

describe('transformRefund (lemon-squeezy)', () => {
  it('maps raw.id to id', () => {
    const result = transformRefund(makeRaw())
    expect(result.id).toBe('ref-55')
  })

  it('maps order_id to orderId', () => {
    const result = transformRefund(makeRaw())
    expect(result.orderId).toBe('100')
  })

  it('maps total cents directly to amount.amount', () => {
    const result = transformRefund(makeRaw({ total: 4999 }))
    expect(result.amount?.amount).toBe(4999)
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps reason', () => {
    const result = transformRefund(makeRaw())
    expect(result.reason).toBe('No longer needed')
  })

  it('maps refunded_at to processedAt', () => {
    const result = transformRefund(makeRaw())
    expect(result.processedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('falls back to updated_at for processedAt when refunded_at is null', () => {
    const result = transformRefund(
      makeRaw({ refunded_at: null, updated_at: '2024-04-01T00:00:00Z' }),
    )
    expect(result.processedAt).toBe('2024-04-01T00:00:00Z')
  })

  it('maps refunded_at to createdAt', () => {
    const result = transformRefund(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('falls back to created_at for createdAt when refunded_at is null', () => {
    const result = transformRefund(
      makeRaw({ refunded_at: null, created_at: '2024-02-01T00:00:00Z' }),
    )
    expect(result.createdAt).toBe('2024-02-01T00:00:00Z')
  })

  it('stores id and type in metadata', () => {
    const result = transformRefund(makeRaw())
    const meta = result.metadata as Record<string, unknown>
    expect(meta.id).toBe('ref-55')
    expect(meta.type).toBe('refunds')
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeRaw())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
