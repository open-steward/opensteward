import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawSezzleRefundResponse,
  type SezzleRefundContext,
} from '../../../../../../../src/verticals/payments/adapters/sezzle/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('sezzle transformRefund', () => {
  it('maps a successful refund response with uuid to status "succeeded"', () => {
    const raw: RawSezzleRefundResponse = {
      uuid: 'refund-uuid-001',
    }
    const ctx: SezzleRefundContext = {
      orderId: 'order-uuid-001',
      amountInCents: 2000,
      currency: 'USD',
    }
    const result = transformRefund(raw, ctx)
    expect(result.id).toBe('refund-uuid-001')
    expect(result.externalId).toBe('refund-uuid-001')
    expect(result.chargeId).toBe('order-uuid-001')
    expect(result.amount).toBe(2000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('sezzle')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a refund response without uuid to status "pending"', () => {
    const raw: RawSezzleRefundResponse = {}
    const ctx: SezzleRefundContext = {
      orderId: 'order-uuid-002',
      amountInCents: 500,
      currency: 'USD',
      reason: 'requested_by_customer',
    }
    const result = transformRefund(raw, ctx)
    expect(result.status).toBe('pending')
    expect(result.chargeId).toBe('order-uuid-002')
    expect(result.amount).toBe(500)
    expect(result.metadata['reason']).toBe('requested_by_customer')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
