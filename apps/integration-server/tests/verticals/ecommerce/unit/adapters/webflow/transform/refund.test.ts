import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWebflowRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/webflow/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawWebflowRefund> = {}): RawWebflowRefund {
  return {
    id: 'ref_001',
    orderId: 'ord_001',
    amount: 5000,
    currency: 'USD',
    reason: 'Customer request',
    note: 'Refund processed',
    refundedOn: '2024-05-05T10:00:00Z',
    createdOn: '2024-05-05T09:00:00Z',
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('maps core fields and converts cents to amount', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('ref_001')
    expect(result.orderId).toBe('ord_001')
    expect(result.amount).toEqual({ amount: 5000, currency: 'USD' })
    expect(result.reason).toBe('Customer request')
    expect(result.note).toBe('Refund processed')
    expect(result.processedAt).toBe('2024-05-05T10:00:00Z')
  })

  it('handles missing amount', () => {
    const result = transformRefund(makeRefund({ amount: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips reason via untransformRefund', () => {
    const canonical = transformRefund(makeRefund())
    const raw = untransformRefund(canonical)
    expect(raw.reason).toBe('Customer request')
  })
})
