import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawXenditRefund,
} from '../../../../../../../src/verticals/payments/adapters/xendit/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('xendit transformRefund', () => {
  it('maps SUCCEEDED status and REQUESTED_BY_CUSTOMER reason', () => {
    const raw: RawXenditRefund = {
      id: 're-001',
      payment_request_id: 'pr-001',
      amount: 50000,
      currency: 'IDR',
      status: 'SUCCEEDED',
      reason: 'REQUESTED_BY_CUSTOMER',
      created: '2024-03-01T00:00:00Z',
      updated: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.reason).toBe('requested_by_customer')
    expect(result.chargeId).toBe('pr-001')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('IDR')
    expect(result.gateway).toBe('xendit')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps FAILED status and FRAUDULENT reason', () => {
    const raw: RawXenditRefund = {
      id: 're-002',
      payment_id: 'pay-002',
      amount: 25000,
      currency: 'PHP',
      status: 'FAILED',
      reason: 'FRAUDULENT',
      failure_code: 'ACCOUNT_ERROR',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.reason).toBe('fraudulent')
    expect(result.failureReason).toBe('ACCOUNT_ERROR')
    expect(result.chargeId).toBe('pay-002')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps DUPLICATE reason correctly', () => {
    const raw: RawXenditRefund = {
      id: 're-003',
      payment_request_id: 'pr-003',
      amount: 10000,
      currency: 'IDR',
      status: 'PENDING',
      reason: 'DUPLICATE',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('duplicate')
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps CANCELLATION reason to "other"', () => {
    const raw: RawXenditRefund = {
      id: 're-004',
      payment_request_id: 'pr-004',
      amount: 5000,
      currency: 'IDR',
      status: 'SUCCEEDED',
      reason: 'CANCELLATION',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.reason).toBe('other')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
