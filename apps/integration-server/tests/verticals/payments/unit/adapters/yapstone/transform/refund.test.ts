import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawYapstoneRefund,
} from '../../../../../../../src/verticals/payments/adapters/yapstone/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('yapstone transformRefund', () => {
  it('maps a succeeded refund with paymentId as chargeId', () => {
    const raw: RawYapstoneRefund = {
      id: 're-001',
      paymentId: 'pay-001',
      amount: 5000,
      currency: 'USD',
      status: 'succeeded',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformRefund(raw)
    expect(result.id).toBe('re-001')
    expect(result.chargeId).toBe('pay-001')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('yapstone')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund', () => {
    const raw: RawYapstoneRefund = {
      id: 're-002',
      paymentId: 'pay-002',
      amount: 2500,
      currency: 'EUR',
      status: 'failed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('EUR')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a pending refund (default)', () => {
    const raw: RawYapstoneRefund = {
      id: 're-003',
      paymentId: 'pay-003',
      amount: 1000,
      currency: 'GBP',
      status: 'processing',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('pending')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a processed refund to "succeeded"', () => {
    const raw: RawYapstoneRefund = {
      id: 're-004',
      paymentId: 'pay-004',
      amount: 750,
      currency: 'USD',
      status: 'processed',
    }
    const result = transformRefund(raw)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
