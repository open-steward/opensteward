import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/paytr/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('paytr transformRefund', () => {
  it('maps a success status to "succeeded" with correct amount and chargeId', () => {
    const raw = {
      merchant_oid: 'PAYTR_ORDER_001',
      return_amount: 10000,
      currency: 'TRY',
      status: 'success',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('TRY')
    expect(result.id).toBe('PAYTR_ORDER_001')
    // chargeId is same as id for paytr (merchant_oid links refund to its charge)
    expect(result.chargeId).toBe('PAYTR_ORDER_001')
    expect(result.gateway).toBe('paytr')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending status to "pending"', () => {
    const raw = {
      merchant_oid: 'PAYTR_ORDER_002',
      return_amount: 5000,
      currency: 'TRY',
      status: 'pending',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(5000)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed status to "failed"', () => {
    const raw = {
      merchant_oid: 'PAYTR_ORDER_003',
      return_amount: 2500,
      currency: 'TRY',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a "processed" status to "succeeded"', () => {
    const raw = {
      merchant_oid: 'PAYTR_ORDER_004',
      return_amount: 7500,
      currency: 'USD',
      status: 'processed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to TRY when absent', () => {
    const raw = {
      merchant_oid: 'PAYTR_ORDER_005',
      return_amount: 1000,
      status: 'success',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('TRY')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
