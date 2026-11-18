import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawOpenpayRefund,
} from '../../../../../../../src/verticals/payments/adapters/openpay/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('openpay transformRefund', () => {
  it('maps fields to canonical refund', () => {
    const raw: RawOpenpayRefund = {
      id: 're_abc123',
      transaction_id: 'trx_parent',
      amount: 50.0,
      currency: 'mxn',
      status: 'completed',
      creation_date: '2024-03-01T00:00:00Z',
      metadata: { note: 'customer request' },
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re_abc123')
    expect(result.externalId).toBe('re_abc123')
    expect(result.chargeId).toBe('trx_parent')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('MXN')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('openpay')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.metadata).toEqual({ note: 'customer request' })
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps failed status correctly', () => {
    const raw: RawOpenpayRefund = {
      id: 're_fail',
      transaction_id: 'trx_123',
      amount: 25.0,
      currency: 'MXN',
      status: 'declined',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults status to pending for unknown status values', () => {
    const raw: RawOpenpayRefund = {
      id: 're_pend',
      transaction_id: 'trx_456',
      amount: 10.0,
      currency: 'MXN',
      status: 'processing',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('uses extra as metadata fallback', () => {
    const raw: RawOpenpayRefund = {
      id: 're_extra',
      transaction_id: 'trx_789',
      amount: 5.0,
      currency: 'MXN',
      extra: { reason: 'duplicate' },
    }
    const result = transformRefund(raw)
    expect(result.metadata).toEqual({ reason: 'duplicate' })
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to MXN when absent', () => {
    const raw: RawOpenpayRefund = {
      id: 're_nocur',
      transaction_id: 'trx_000',
      amount: 1.0,
      status: 'succeeded',
    }
    const result = transformRefund(raw)
    expect(result.currency).toBe('MXN')
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
