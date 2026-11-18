import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawPinRefund,
} from '../../../../../../../src/verticals/payments/adapters/pin-payments/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('pin-payments transformRefund', () => {
  it('maps status "success" to "succeeded" and sets chargeId from charge_token', () => {
    const raw: RawPinRefund = {
      token: 'ref_abc123',
      charge_token: 'ch_parent',
      amount: 1000,
      currency: 'AUD',
      status: 'success',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(result.id).toBe('ref_abc123')
    expect(result.chargeId).toBe('ch_parent')
    expect(result.amount).toBe(1000)
    expect(result.currency).toBe('AUD')
    expect(result.gateway).toBe('pin-payments')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps status "failed" to "failed"', () => {
    const raw: RawPinRefund = {
      token: 'ref_fail',
      charge_token: 'ch_x',
      amount: 500,
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults to "pending" for unknown status', () => {
    const raw: RawPinRefund = {
      token: 'ref_pending',
      charge_token: 'ch_y',
      amount: 200,
      status: 'processing',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to AUD when absent', () => {
    const raw: RawPinRefund = {
      token: 'ref_aud',
      charge_token: 'ch_z',
      amount: 100,
      status: 'success',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('AUD')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
