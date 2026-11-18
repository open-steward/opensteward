import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawCashfreeRefund,
} from '../../../../../../../src/verticals/payments/adapters/cashfree/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('cashfree transformRefund', () => {
  it('maps a successful refund', () => {
    const raw: RawCashfreeRefund = {
      cf_refund_id: 'rfnd-cf-001',
      refund_id: 'rfnd-001',
      order_id: 'ord-001',
      refund_amount: 150,
      refund_currency: 'INR',
      refund_status: 'SUCCESS',
      created_at: '2024-03-01T00:00:00Z',
      processed_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('rfnd-cf-001')
    expect(result.chargeId).toBe('ord-001')
    expect(result.amount).toBe(15000)
    expect(result.currency).toBe('INR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('cashfree')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund', () => {
    const raw: RawCashfreeRefund = {
      cf_refund_id: 'rfnd-cf-002',
      order_id: 'ord-002',
      refund_amount: 50,
      refund_currency: 'INR',
      refund_status: 'PENDING',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled refund', () => {
    const raw: RawCashfreeRefund = {
      cf_refund_id: 'rfnd-cf-003',
      order_id: 'ord-003',
      refund_amount: 25,
      refund_currency: 'USD',
      refund_status: 'CANCELLED',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('cancelled')
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
