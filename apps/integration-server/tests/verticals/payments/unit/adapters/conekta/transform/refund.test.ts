import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawConektaRefund,
} from '../../../../../../../src/verticals/payments/adapters/conekta/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('conekta transformRefund', () => {
  it('maps a completed refund to status "succeeded" with chargeId from orderId', () => {
    const raw: RawConektaRefund = {
      id: 'ref-001',
      amount: 1500,
      currency: 'MXN',
      status: 'completed',
      reason: 'requested_by_customer',
      created_at: 1709251200,
    }
    const result = transformRefund(raw, 'ord-001', 'MXN')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1500)
    expect(result.currency).toBe('MXN')
    expect(result.chargeId).toBe('ord-001')
    expect(result.reason).toBe('requested_by_customer')
    expect(result.gateway).toBe('conekta')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund to status "pending"', () => {
    const raw: RawConektaRefund = {
      id: 'ref-002',
      amount: 500,
      currency: 'MXN',
      status: 'pending',
      created_at: 1709251200,
    }
    const result = transformRefund(raw, 'ord-002')
    expect(result.status).toBe('pending')
    expect(result.chargeId).toBe('ord-002')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a fraudulent reason correctly', () => {
    const raw: RawConektaRefund = {
      id: 'ref-003',
      amount: 2000,
      currency: 'MXN',
      status: 'refunded',
      reason: 'fraudulent',
      created_at: 1709251200,
    }
    const result = transformRefund(raw, 'ord-003', 'MXN')
    expect(result.status).toBe('succeeded')
    expect(result.reason).toBe('fraudulent')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
