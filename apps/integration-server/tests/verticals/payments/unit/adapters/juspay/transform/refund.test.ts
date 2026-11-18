import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawJuspayRefund,
} from '../../../../../../../src/verticals/payments/adapters/juspay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('juspay transformRefund', () => {
  it('maps status SUCCESS to "succeeded" and uses ref as id', () => {
    const raw: RawJuspayRefund = {
      ref: 'ref-001',
      unique_request_id: 'ureq-001',
      order_id: 'order-001',
      status: 'SUCCESS',
      amount: 100,
      currency: 'INR',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.id).toBe('ref-001')
    expect(result.chargeId).toBe('order-001')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('INR')
    expect(result.gateway).toBe('juspay')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status PENDING to "pending"', () => {
    const raw: RawJuspayRefund = {
      ref: 'ref-002',
      order_id: 'order-002',
      status: 'PENDING',
      amount: 50,
      currency: 'INR',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status FAILURE to "failed" and captures error', () => {
    const raw: RawJuspayRefund = {
      ref: 'ref-003',
      order_id: 'order-003',
      status: 'FAILURE',
      amount: 25,
      currency: 'INR',
      error_code: 'REFUND_FAILED',
      error_message: 'Gateway rejected the refund',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Gateway rejected the refund')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('falls back to unique_request_id as id when ref is absent', () => {
    const raw: RawJuspayRefund = {
      unique_request_id: 'ureq-004',
      order_id: 'order-004',
      status: 'SUCCESS',
      amount: 10,
      currency: 'INR',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('ureq-004')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
