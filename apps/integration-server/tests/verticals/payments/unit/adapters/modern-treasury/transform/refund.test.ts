import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawModernTreasuryReversal,
} from '../../../../../../../src/verticals/payments/adapters/modern-treasury/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('modern-treasury transformRefund', () => {
  it('maps a succeeded reversal with payment_order_id as chargeId', () => {
    const raw: RawModernTreasuryReversal = {
      id: 'rev-001',
      payment_order_id: 'po-001',
      amount: 3000,
      currency: 'USD',
      status: 'completed',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('rev-001')
    expect(result.chargeId).toBe('po-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(3000)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('modern-treasury')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed reversal to status "failed"', () => {
    const raw: RawModernTreasuryReversal = {
      id: 'rev-002',
      payment_order_id: 'po-002',
      amount: 1500,
      currency: 'EUR',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to pending for unrecognized status', () => {
    const raw: RawModernTreasuryReversal = {
      id: 'rev-003',
      payment_order_id: 'po-003',
      amount: 500,
      currency: 'GBP',
      status: 'processing',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
