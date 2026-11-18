import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawIpay88Refund,
} from '../../../../../../../src/verticals/payments/adapters/ipay88/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('ipay88 transformRefund', () => {
  it('maps a successful refund', () => {
    const raw: RawIpay88Refund = {
      RefNo: 'REF-001',
      Amount: 3000,
      currency: 'MYR',
      Status: 'success',
      Created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('REF-001')
    expect(result.chargeId).toBe('REF-001')
    expect(result.amount).toBe(3000)
    expect(result.currency).toBe('MYR')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('ipay88')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "processed" status to "succeeded"', () => {
    const raw: RawIpay88Refund = {
      RefNo: 'REF-002',
      Amount: 500,
      currency: 'MYR',
      Status: 'processed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps "failed" status to "failed"', () => {
    const raw: RawIpay88Refund = {
      RefNo: 'REF-003',
      Amount: 1000,
      currency: 'MYR',
      Status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to "pending" for unknown status', () => {
    const raw: RawIpay88Refund = {
      RefNo: 'REF-004',
      Amount: 200,
      Status: 'initiated',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('MYR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
