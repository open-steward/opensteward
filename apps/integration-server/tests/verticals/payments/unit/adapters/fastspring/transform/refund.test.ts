import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawFastspringReturn,
} from '../../../../../../../src/verticals/payments/adapters/fastspring/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('fastspring transformRefund', () => {
  it('maps a completed return to status "succeeded"', () => {
    const raw: RawFastspringReturn = {
      return: 'RET-001',
      reference: 'RETREF-001',
      completed: true,
      currency: 'usd',
      totalReturn: 29.99,
      changed: 1709251200000,
      original: {
        id: 'ORDER-001',
        order: 'ORD-001',
        reference: 'FS-REF-001',
        total: 29.99,
      },
      reason: 'customer request',
      account: { id: 'ACCT-001', account: 'ACCT-001' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('fastspring')
    expect(result.id).toBe('RET-001')
    expect(result.chargeId).toBe('ORDER-001')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps an incomplete return to status "pending"', () => {
    const raw: RawFastspringReturn = {
      return: 'RET-002',
      completed: false,
      currency: 'USD',
      totalReturn: 10,
      original: { id: 'ORDER-002', order: 'ORD-002' },
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(1000)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses externalId from reference when present', () => {
    const raw: RawFastspringReturn = {
      return: 'RET-003',
      reference: 'REF-EXTERNAL-003',
      completed: true,
      currency: 'USD',
      totalReturn: 5,
    }
    const result = transformRefund(raw)
    expect(result.externalId).toBe('REF-EXTERNAL-003')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
