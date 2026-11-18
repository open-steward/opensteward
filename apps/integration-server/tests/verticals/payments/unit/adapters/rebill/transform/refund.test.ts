import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawRebillRefund,
} from '../../../../../../../src/verticals/payments/adapters/rebill/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('rebill transformRefund', () => {
  it('maps state "success" to "succeeded" and links chargeId via payment_id', () => {
    const raw: RawRebillRefund = {
      id: 'ref_rebill_001',
      payment_id: 'pay_parent',
      amount: 800,
      currency: 'USD',
      state: 'success',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.id).toBe('ref_rebill_001')
    expect(result.chargeId).toBe('pay_parent')
    expect(result.amount).toBe(800)
    expect(result.currency).toBe('USD')
    expect(result.gateway).toBe('rebill')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps state "failed" to "failed"', () => {
    const raw: RawRebillRefund = {
      id: 'ref_fail',
      payment_id: 'pay_x',
      amount: 400,
      state: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to "pending" for unknown state', () => {
    const raw: RawRebillRefund = {
      id: 'ref_pend',
      payment_id: 'pay_y',
      amount: 200,
      state: 'processing',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when absent', () => {
    const raw: RawRebillRefund = {
      id: 'ref_usd',
      payment_id: 'pay_z',
      amount: 100,
      state: 'succeeded',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('USD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
